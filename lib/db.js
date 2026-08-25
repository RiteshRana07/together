// Postgres persistence layer for WatchTogether.
// The schema is created/migrated lazily so the app can be deployed without
// a separate migration command. This is compatible with Neon/Vercel Postgres,
// Supabase, Railway and other PostgreSQL providers.
const { Pool } = require("pg");
const crypto = require("crypto");

if (!process.env.DATABASE_URL) {
  console.warn("[db] DATABASE_URL is not set. Set it in your environment (see .env.example).");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
});

let schemaReady;
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        email_verified BOOLEAN NOT NULL DEFAULT FALSE,
        verification_token_hash TEXT,
        verification_expires_at BIGINT,
        password_reset_token_hash TEXT,
        password_reset_expires_at BIGINT,
        avatar_url TEXT,
        settings JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at BIGINT NOT NULL
      );

      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_hash TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expires_at BIGINT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token_hash TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires_at BIGINT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;
      -- Accounts created before email verification existed remain usable.
      UPDATE users SET email_verified=TRUE WHERE verification_token_hash IS NULL AND email_verified=FALSE;

      CREATE TABLE IF NOT EXISTS movies (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        video_url TEXT NOT NULL,
        created_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        video_url TEXT NOT NULL,
        video_title TEXT,
        video_source TEXT NOT NULL,
        movie_id TEXT REFERENCES movies(id),
        host_id TEXT NOT NULL REFERENCES users(id),
        max_participants INTEGER,
        created_at BIGINT NOT NULL
      );

      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS video_title TEXT;
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS movie_id TEXT REFERENCES movies(id);
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS max_participants INTEGER;

      -- Immutable room identity and mutable playback state.
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS original_video_url TEXT;
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS original_video_title TEXT;
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS original_video_source TEXT;
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS original_movie_id TEXT REFERENCES movies(id);
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS current_video_url TEXT;
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS current_video_title TEXT;
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS current_video_source TEXT;
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS current_movie_id TEXT REFERENCES movies(id);
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS playback_time DOUBLE PRECISION NOT NULL DEFAULT 0;
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS playback_playing BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS playback_updated_at BIGINT;

      UPDATE rooms
      SET
        original_video_url = COALESCE(original_video_url, video_url),
        original_video_title = COALESCE(original_video_title, video_title),
        original_video_source = COALESCE(original_video_source, video_source),
        original_movie_id = COALESCE(original_movie_id, movie_id),
        current_video_url = COALESCE(current_video_url, video_url),
        current_video_title = COALESCE(current_video_title, video_title),
        current_video_source = COALESCE(current_video_source, video_source),
        current_movie_id = COALESCE(current_movie_id, movie_id)
      WHERE original_video_url IS NULL
         OR original_video_title IS NULL
         OR original_video_source IS NULL
         OR current_video_url IS NULL
         OR current_video_source IS NULL;

      -- Active room membership reservations. Pusher presence is the realtime
      -- source of truth for UI, while this table makes the capacity check
      -- atomic and resistant to simultaneous join races.
      CREATE TABLE IF NOT EXISTS room_members (
        room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at BIGINT NOT NULL,
        last_seen BIGINT NOT NULL,
        PRIMARY KEY (room_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_room_members_room_seen
        ON room_members(room_id, last_seen);

      -- Persistent room access. Unlike room_members, this is NOT presence.
      -- It keeps a room in a user's Watch Rooms list after they leave, until
      -- they explicitly remove it or the host deletes the room.
      CREATE TABLE IF NOT EXISTS room_access (
        room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at BIGINT NOT NULL,
        last_entered_at BIGINT NOT NULL,
        removed_at BIGINT,
        PRIMARY KEY (room_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_room_access_user_removed
        ON room_access(user_id, removed_at, last_entered_at DESC);

      -- Backfill persistent access for rooms/users known to older versions.
      INSERT INTO room_access (room_id,user_id,joined_at,last_entered_at,removed_at)
      SELECT r.id, r.host_id, r.created_at, r.created_at, NULL
      FROM rooms r
      ON CONFLICT (room_id,user_id) DO NOTHING;
      INSERT INTO room_access (room_id,user_id,joined_at,last_entered_at,removed_at)
      SELECT rm.room_id, rm.user_id, rm.joined_at, rm.last_seen, NULL
      FROM room_members rm
      ON CONFLICT (room_id,user_id) DO NOTHING;

      CREATE TABLE IF NOT EXISTS room_queue (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        added_by TEXT NOT NULL REFERENCES users(id),
        video_url TEXT NOT NULL,
        video_title TEXT,
        video_source TEXT NOT NULL,
        movie_id TEXT REFERENCES movies(id),
        status TEXT NOT NULL DEFAULT 'queued',
        created_at BIGINT NOT NULL,
        played_at BIGINT
      );
      CREATE INDEX IF NOT EXISTS idx_room_queue_order
        ON room_queue(room_id, status, created_at);

      -- Queue items remain available after playback. Older versions marked a
      -- played item as 'played'; migrate those records back to the visible
      -- queued state because playback is no longer a removal operation.
      UPDATE room_queue SET status = 'queued' WHERE status = 'played';

      CREATE TABLE IF NOT EXISTS room_messages (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        username TEXT NOT NULL,
        message TEXT NOT NULL,
        client_id TEXT,
        created_at BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_room_messages_order ON room_messages(room_id, created_at);

      CREATE TABLE IF NOT EXISTS room_signals (
        id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, target_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        payload JSONB NOT NULL, created_at BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_room_signals_target_time ON room_signals(room_id, target_user_id, created_at);

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, room_code TEXT, room_name TEXT, video_title TEXT, created_at BIGINT NOT NULL, read_at BIGINT
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_user_time ON notifications(user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS room_history (
        id TEXT PRIMARY KEY, room_id TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL, host_id TEXT NOT NULL, host_username TEXT,
        video_title TEXT, video_url TEXT, video_source TEXT, playback_time DOUBLE PRECISION NOT NULL DEFAULT 0, ended_at BIGINT NOT NULL,
        participants JSONB NOT NULL DEFAULT '[]'::jsonb, chat JSONB NOT NULL DEFAULT '[]'::jsonb
      );
      CREATE INDEX IF NOT EXISTS idx_room_history_host_time ON room_history(host_id, ended_at DESC);

      CREATE TABLE IF NOT EXISTS storage_uploads (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        folder_id BIGINT NOT NULL,
        uploadlink_id BIGINT NOT NULL,
        code TEXT NOT NULL,
        object_name TEXT NOT NULL,
        size BIGINT NOT NULL,
        progress_hash TEXT NOT NULL,
        created_at BIGINT NOT NULL
      );
      ALTER TABLE storage_uploads ALTER COLUMN uploadlink_id DROP NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_storage_uploads_owner
        ON storage_uploads(owner_id, created_at);
    `);
  }
  return schemaReady;
}

function id() {
  return crypto.randomUUID();
}

function shortCode(length = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

async function createUser({ username, email, passwordHash, verificationTokenHash, verificationExpiresAt }) {
  await ensureSchema();
  const userId = id();
  await pool.query(
    `INSERT INTO users (id, username, email, password_hash, email_verified, verification_token_hash, verification_expires_at, settings, created_at)
     VALUES ($1, $2, $3, $4, FALSE, $5, $6, $7::jsonb, $8)`,
    [userId, username, email, passwordHash, verificationTokenHash || null, verificationExpiresAt || null, JSON.stringify({ emailNotifications: true, roomInvites: true, chatNotifications: true, autoplay: true }), Date.now()]
  );
  return { id: userId, username, email, email_verified: false, avatar_url: null };
}

async function getUserByEmail(email) {
  await ensureSchema();
  const { rows } = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
  return rows[0] || null;
}

async function getUserById(userId) {
  await ensureSchema();
  const { rows } = await pool.query(`SELECT id, username, email, email_verified, avatar_url, settings, created_at FROM users WHERE id = $1`, [userId]);
  return rows[0] || null;
}

async function getUserAuthById(userId) {
  await ensureSchema();
  const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [userId]);
  return rows[0] || null;
}

async function updateUserProfileSafe(userId, { username, email, avatarUrl, settings, verificationTokenHash, verificationExpiresAt }) {
  await ensureSchema();
  const current = await getUserById(userId);
  if (!current) return null;
  const nextUsername = username ?? current.username;
  const nextEmail = email ? email.toLowerCase() : current.email;
  const emailChanged = nextEmail !== current.email.toLowerCase();
  const nextSettings = settings ?? current.settings ?? {};
  const { rows } = await pool.query(
    `UPDATE users SET username=$1, email=$2, avatar_url=COALESCE($3, avatar_url), settings=$4::jsonb,
      email_verified=CASE WHEN $5 THEN FALSE ELSE email_verified END,
      verification_token_hash=CASE WHEN $5 THEN $6 ELSE verification_token_hash END,
      verification_expires_at=CASE WHEN $5 THEN $7 ELSE verification_expires_at END
     WHERE id=$8
     RETURNING id, username, email, email_verified, avatar_url, settings, created_at`,
    [nextUsername, nextEmail, avatarUrl ?? null, JSON.stringify(nextSettings), emailChanged, emailChanged ? verificationTokenHash || null : null, emailChanged ? verificationExpiresAt || null : null, userId]
  );
  return rows[0] || null;
}

async function updateUserPassword(userId, passwordHash) {
  await ensureSchema();
  await pool.query(`UPDATE users SET password_hash=$1 WHERE id=$2`, [passwordHash, userId]);
}

async function setVerificationToken(userId, tokenHash, expiresAt) {
  await ensureSchema();
  await pool.query(`UPDATE users SET verification_token_hash=$1, verification_expires_at=$2 WHERE id=$3`, [tokenHash, expiresAt, userId]);
}

async function setPasswordResetToken(userId, tokenHash, expiresAt) {
  await ensureSchema();
  await pool.query(
    `UPDATE users SET password_reset_token_hash=$1, password_reset_expires_at=$2 WHERE id=$3`,
    [tokenHash, expiresAt, userId]
  );
}

async function resetPasswordByTokenHash(tokenHash, passwordHash) {
  await ensureSchema();
  const { rows } = await pool.query(
    `UPDATE users
     SET password_hash=$1, password_reset_token_hash=NULL, password_reset_expires_at=NULL
     WHERE password_reset_token_hash=$2 AND password_reset_expires_at > $3
     RETURNING id, username, email`,
    [passwordHash, tokenHash, Date.now()]
  );
  return rows[0] || null;
}

async function verifyUserByTokenHash(tokenHash) {
  await ensureSchema();
  const { rows } = await pool.query(
    `UPDATE users SET email_verified=TRUE, verification_token_hash=NULL, verification_expires_at=NULL
     WHERE verification_token_hash=$1 AND verification_expires_at > $2
     RETURNING id, username, email, email_verified, avatar_url, settings, created_at`,
    [tokenHash, Date.now()]
  );
  return rows[0] || null;
}

async function getUserByUsername(username) {
  await ensureSchema();
  const { rows } = await pool.query(`SELECT * FROM users WHERE username=$1`, [username]);
  return rows[0] || null;
}

async function createRoom({ name, videoUrl, videoTitle, videoSource, movieId, maxParticipants, hostId }) {
  await ensureSchema();
  const roomId = id();
  let code;
  do {
    code = shortCode(6);
  } while (await getRoomByCode(code));

  await pool.query(
    `INSERT INTO rooms (
      id, code, name, video_url, video_title, video_source, movie_id,
      original_video_url, original_video_title, original_video_source, original_movie_id,
      current_video_url, current_video_title, current_video_source, current_movie_id,
      max_participants, host_id, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$4,$5,$6,$7,$4,$5,$6,$7,$8,$9,$10)`,
    [
      roomId,
      code,
      name,
      videoUrl,
      videoTitle || null,
      videoSource,
      movieId || null,
      maxParticipants,
      hostId,
      Date.now(),
    ]
  );

  const room = await getRoomByCode(code);
  await addRoomAccess(code, hostId);
  await createNotification(hostId, { type: 'started', title: 'Watch party started', message: `\"${videoTitle || 'Your screening'}\" has started.`, roomCode: code, roomName: name, videoTitle: videoTitle || null });
  return room;
}

async function getRoomByCode(code) {
  await ensureSchema();
  const { rows } = await pool.query(`SELECT * FROM rooms WHERE code = $1`, [code]);
  return rows[0] || null;
}

async function listRoomsForUser(userId) {
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT r.*,
            CASE WHEN r.host_id = $1 THEN true ELSE false END AS is_host,
            ra.last_entered_at,
            ra.joined_at AS access_joined_at
     FROM rooms r
     LEFT JOIN room_access ra ON ra.room_id = r.id AND ra.user_id = $1
     WHERE r.host_id = $1
        OR (ra.user_id = $1 AND ra.removed_at IS NULL)
     ORDER BY GREATEST(r.created_at, COALESCE(ra.last_entered_at, 0)) DESC`,
    [userId]
  );
  return rows;
}

async function addRoomAccess(code, userId) {
  await ensureSchema();
  const room = await getRoomByCode(code);
  if (!room) return null;
  const now = Date.now();
  await pool.query(
    `INSERT INTO room_access (room_id,user_id,joined_at,last_entered_at,removed_at)
     VALUES ($1,$2,$3,$3,NULL)
     ON CONFLICT (room_id,user_id) DO UPDATE
       SET last_entered_at=EXCLUDED.last_entered_at, removed_at=NULL`,
    [room.id, userId, now]
  );
  return room;
}

async function removeRoomAccess(code, userId) {
  await ensureSchema();
  const room = await getRoomByCode(code);
  if (!room) return null;
  await pool.query(
    `UPDATE room_access SET removed_at=$3 WHERE room_id=$1 AND user_id=$2`,
    [room.id, userId, Date.now()]
  );
  // Removing from the Watch Rooms list is also an explicit presence leave.
  await releaseRoomMember(code, userId);
  return { ok: true };
}

async function createMovie({ title, videoUrl, ownerId }) {
  await ensureSchema();
  const movieId = id();
  await pool.query(
    `INSERT INTO movies (id, owner_id, title, video_url, created_at) VALUES ($1, $2, $3, $4, $5)`,
    [movieId, ownerId, title, videoUrl, Date.now()]
  );
  return getMovieById(movieId, ownerId);
}

async function createMovieIfMissing({ title, videoUrl, ownerId }) {
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`movie:${ownerId}:${videoUrl}`]);
    const existing = await client.query(`SELECT * FROM movies WHERE owner_id = $1 AND video_url = $2 LIMIT 1`, [ownerId, videoUrl]);
    if (existing.rows[0]) {
      await client.query("COMMIT");
      return existing.rows[0];
    }
    const movieId = id();
    await client.query(
      `INSERT INTO movies (id, owner_id, title, video_url, created_at) VALUES ($1, $2, $3, $4, $5)`,
      [movieId, ownerId, title, videoUrl, Date.now()]
    );
    await client.query("COMMIT");
    return getMovieById(movieId, ownerId);
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function listMoviesForUser(ownerId) {
  await ensureSchema();
  const { rows } = await pool.query(`SELECT * FROM movies WHERE owner_id = $1 ORDER BY created_at DESC`, [ownerId]);
  return rows;
}

async function getMovieById(movieId, ownerId) {
  await ensureSchema();
  const { rows } = await pool.query(`SELECT * FROM movies WHERE id = $1 AND owner_id = $2`, [movieId, ownerId]);
  return rows[0] || null;
}

async function deleteMovie(movieId, ownerId) {
  await ensureSchema();
  await pool.query(`DELETE FROM movies WHERE id = $1 AND owner_id = $2`, [movieId, ownerId]);
}

async function deleteRoom(code, hostId) {
  await ensureSchema();
  const room = await getRoomByCode(code);
  if (!room || room.host_id !== hostId) return null;
  const [hostRes, membersRes, chatRes] = await Promise.all([
    pool.query(`SELECT username FROM users WHERE id=$1`, [room.host_id]),
    pool.query(`SELECT rm.user_id AS id, u.username, (r.host_id=rm.user_id) AS is_host FROM room_members rm JOIN rooms r ON r.id=rm.room_id JOIN users u ON u.id=rm.user_id WHERE r.id=$1`, [room.id]),
    pool.query(`SELECT id,user_id,username,message,created_at FROM room_messages WHERE room_id=$1 ORDER BY created_at ASC`, [room.id]),
  ]);
  const participants = membersRes.rows;
  if (!participants.some(p => String(p.id) === String(hostId))) participants.unshift({ id: hostId, username: hostRes.rows[0]?.username || 'Host', is_host: true });
  const endedAt = Date.now();
  await pool.query(`INSERT INTO room_history (id,room_id,code,name,host_id,host_username,video_title,video_url,video_source,playback_time,ended_at,participants,chat) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb)`, [id(), room.id, room.code, room.name, room.host_id, hostRes.rows[0]?.username || null, room.current_video_title || room.video_title || room.original_video_title || 'Untitled screening', room.current_video_url || room.video_url, room.current_video_source || room.video_source, Number(room.playback_time || 0), endedAt, JSON.stringify(participants), JSON.stringify(chatRes.rows)]);
  for (const uid of [...new Set(participants.map(p => p.id))]) await createNotification(uid, { type: 'ended', title: 'Watch party ended', message: `\"${room.name}\" has ended.`, roomCode: room.code, roomName: room.name, videoTitle: room.current_video_title || room.video_title || null });
  await pool.query(`DELETE FROM rooms WHERE code = $1 AND host_id = $2`, [code, hostId]);
  return { ok: true };
}

async function updateRoomCapacity(code, hostId, maxParticipants) {
  await ensureSchema();
  const { rows } = await pool.query(
    `UPDATE rooms SET max_participants = $1 WHERE code = $2 AND host_id = $3 RETURNING *`,
    [maxParticipants, code, hostId]
  );
  return rows[0] || null;
}

async function reserveRoomSeat(code, userId) {
  await ensureSchema();
  const client = await pool.connect();
  const now = Date.now();
  const staleBefore = now - 45_000;
  try {
    await client.query("BEGIN");
    // Serialize seat allocation per room. This closes the simultaneous-join race
    // where two Pusher auth requests both observe the same free seat.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [String(code)]);

    const roomRes = await client.query(`SELECT * FROM rooms WHERE code = $1 FOR UPDATE`, [code]);
    const room = roomRes.rows[0];
    if (!room) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "not_found" };
    }

    await client.query(`DELETE FROM room_members WHERE room_id = $1 AND last_seen < $2`, [room.id, staleBefore]);

    const existing = await client.query(
      `SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2`,
      [room.id, userId]
    );
    if (existing.rowCount) {
      await client.query(`UPDATE room_members SET last_seen = $3 WHERE room_id = $1 AND user_id = $2`, [room.id, userId, now]);
      await client.query("COMMIT");
      return { ok: true, room, alreadyMember: true };
    }

    const countRes = await client.query(`SELECT COUNT(*)::int AS count FROM room_members WHERE room_id = $1`, [room.id]);
    const count = countRes.rows[0].count;
    const isHost = room.host_id === userId;
    if (!isHost && room.max_participants && count >= room.max_participants) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "full", count, maxParticipants: room.max_participants };
    }

    await client.query(
      `INSERT INTO room_members (room_id, user_id, joined_at, last_seen) VALUES ($1,$2,$3,$3)
       ON CONFLICT (room_id,user_id) DO UPDATE SET last_seen = EXCLUDED.last_seen`,
      [room.id, userId, now]
    );
    await client.query(
      `INSERT INTO room_access (room_id,user_id,joined_at,last_entered_at,removed_at)
       VALUES ($1,$2,$3,$3,NULL)
       ON CONFLICT (room_id,user_id) DO UPDATE
         SET last_entered_at=EXCLUDED.last_entered_at, removed_at=NULL`,
      [room.id, userId, now]
    );
    await client.query("COMMIT");
    if (!isHost) {
      const joiner = await getUserById(userId);
      if (joiner) await createNotification(room.host_id, { type: 'join', title: 'Room joined', message: `${joiner.username} joined \"${room.name}\".`, roomCode: room.code, roomName: room.name, videoTitle: room.current_video_title || room.video_title || null });
    }
    return { ok: true, room, alreadyMember: false };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function touchRoomMember(code, userId) {
  await ensureSchema();
  await pool.query(
    `UPDATE room_members rm
     SET last_seen = $3
     FROM rooms r
     WHERE rm.room_id = r.id AND r.code = $1 AND rm.user_id = $2`,
    [code, userId, Date.now()]
  );
}

async function releaseRoomMember(code, userId) {
  await ensureSchema();
  await pool.query(
    `DELETE FROM room_members rm USING rooms r WHERE rm.room_id = r.id AND r.code = $1 AND rm.user_id = $2`,
    [code, userId]
  );
}

async function isActiveRoomMember(code, userId) {
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT 1
     FROM room_members rm
     JOIN rooms r ON r.id = rm.room_id
     WHERE r.code = $1 AND rm.user_id = $2 AND rm.last_seen >= $3
     LIMIT 1`,
    [code, userId, Date.now() - 45_000]
  );
  return !!rows[0];
}

async function getRoomOccupancy(code) {
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT r.max_participants, COUNT(rm.user_id)::int AS count
     FROM rooms r
     LEFT JOIN room_members rm ON rm.room_id = r.id AND rm.last_seen >= $2
     WHERE r.code = $1
     GROUP BY r.id`,
    [code, Date.now() - 45_000]
  );
  return rows[0] || null;
}

async function updateRoomPlaybackState(code, hostId, { time = 0, playing = false } = {}) {
  await ensureSchema();
  const safeTime = Number.isFinite(Number(time)) && Number(time) >= 0 ? Number(time) : 0;
  const safePlaying = !!playing;
  const { rows } = await pool.query(
    `UPDATE rooms SET playback_time=$1, playback_playing=$2, playback_updated_at=$3 WHERE code=$4 AND host_id=$5 RETURNING playback_time, playback_playing, playback_updated_at`,
    [safeTime, safePlaying, Date.now(), code, hostId]
  );
  return rows[0] || null;
}

async function createRoomMessage(code, userId, username, message, clientId = null) {
  await ensureSchema();
  const room = await getRoomByCode(code);
  if (!room) return null;
  const text = String(message || '').trim().slice(0, 500);
  if (!text) return null;
  const messageId = id();
  const { rows } = await pool.query(
    `INSERT INTO room_messages (id, room_id, user_id, username, message, client_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, user_id, username, message, client_id, created_at`,
    [messageId, room.id, userId, username, text, clientId ? String(clientId).slice(0, 100) : null, Date.now()]
  );
  return rows[0] || null;
}

async function listRoomMessages(code, limit = 100) {
  await ensureSchema();
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const { rows } = await pool.query(
    `SELECT m.id, m.user_id, m.username, m.message, m.client_id, m.created_at FROM room_messages m JOIN rooms r ON r.id = m.room_id WHERE r.code=$1 ORDER BY m.created_at DESC LIMIT $2`,
    [code, safeLimit]
  );
  return rows.reverse();
}

async function getActiveRoomMembers(code) {
  await ensureSchema();
  const staleBefore = Date.now() - 45_000;
  const { rows } = await pool.query(
    `SELECT rm.user_id AS id, u.username, (r.host_id = rm.user_id) AS is_host, rm.joined_at, rm.last_seen FROM room_members rm JOIN rooms r ON r.id = rm.room_id JOIN users u ON u.id = rm.user_id WHERE r.code=$1 AND rm.last_seen >= $2 ORDER BY rm.joined_at ASC`,
    [code, staleBefore]
  );
  return rows.map((row) => ({ id: row.id, username: row.username, isHost: !!row.is_host, joinedAt: row.joined_at, lastSeen: row.last_seen }));
}

async function createRoomSignal(code, senderId, targetUserId, payload = {}) {
  await ensureSchema();
  const room = await getRoomByCode(code);
  if (!room) return null;
  const now = Date.now();
  const active = await pool.query(
    `SELECT rm.user_id
     FROM room_members rm
     WHERE rm.room_id = $1
       AND rm.user_id = ANY($2::text[])
       AND rm.last_seen >= $3`,
    [room.id, [String(senderId), String(targetUserId)], now - 45_000]
  );
  if (active.rowCount < 2) return null;

  const signalId = id();
  await pool.query(
    `INSERT INTO room_signals
      (id, room_id, sender_id, target_user_id, payload, created_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
    [
      signalId,
      room.id,
      String(senderId),
      String(targetUserId),
      JSON.stringify({
        description: payload?.description || null,
        candidate: payload?.candidate || null,
      }),
      now,
    ]
  );
  return signalId;
}

async function listRoomSignals(code, targetUserId, since = 0) {
  await ensureSchema();
  const room = await getRoomByCode(code);
  if (!room) return [];
  const sinceValue = Number.isFinite(Number(since)) ? Number(since) : 0;
  const { rows } = await pool.query(
    `SELECT s.id, s.sender_id AS "from", s.target_user_id AS "to",
            s.payload, s.created_at AS at
     FROM room_signals s
     WHERE s.room_id = $1
       AND s.target_user_id = $2
       AND s.created_at >= $3
     ORDER BY s.created_at ASC
     LIMIT 200`,
    [room.id, String(targetUserId), sinceValue]
  );

  if (rows.length) {
    const ids = rows.map((row) => row.id);
    await pool.query(`DELETE FROM room_signals WHERE id = ANY($1::text[])`, [ids]);
  }

  return rows.map((row) => ({
    id: row.id,
    from: row.from,
    to: row.to,
    description: row.payload?.description || null,
    candidate: row.payload?.candidate || null,
    at: row.at,
  }));
}

async function addRoomQueueItem({ code, addedBy, videoUrl, videoTitle, videoSource, movieId }) {
  await ensureSchema();
  const room = await getRoomByCode(code);
  if (!room) return null;
  const queueId = id();
  await pool.query(
    `INSERT INTO room_queue (id, room_id, added_by, video_url, video_title, video_source, movie_id, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'queued',$8)`,
    [queueId, room.id, addedBy, videoUrl, videoTitle || null, videoSource, movieId || null, Date.now()]
  );
  const item = await pool.query(`SELECT * FROM room_queue WHERE id = $1`, [queueId]);
  return item.rows[0] || null;
}

async function listRoomQueue(code) {
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT q.*, u.username AS added_by_username
     FROM room_queue q
     LEFT JOIN users u ON u.id = q.added_by
     JOIN rooms r ON r.id = q.room_id
     WHERE r.code = $1 AND q.status = 'queued'
     ORDER BY q.created_at ASC`,
    [code]
  );
  return rows;
}

async function setRoomCurrentVideoFromQueue(code, hostId, queueId) {
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const roomRes = await client.query(`SELECT * FROM rooms WHERE code = $1 FOR UPDATE`, [code]);
    const room = roomRes.rows[0];
    if (!room || room.host_id !== hostId) {
      await client.query("ROLLBACK");
      return { error: "Only the host can play a queued video" };
    }

    const itemRes = await client.query(
      `SELECT * FROM room_queue WHERE id = $1 AND room_id = $2 AND status = 'queued' FOR UPDATE`,
      [queueId, room.id]
    );
    const item = itemRes.rows[0];
    if (!item) {
      await client.query("ROLLBACK");
      return { error: "That queued video is no longer available" };
    }

    // Playing a queue item must NOT remove it from the queue. The item stays
    // queued until someone explicitly presses Remove. We keep played_at only
    // as informational metadata.
    const now = Date.now();
    await client.query(`UPDATE room_queue SET played_at = $2 WHERE id = $1`, [item.id, now]);
    const updatedRes = await client.query(
      `UPDATE rooms SET
        video_url = $1, video_title = $2, video_source = $3, movie_id = $4,
        current_video_url = $1, current_video_title = $2, current_video_source = $3, current_movie_id = $4
       WHERE id = $5 RETURNING *`,
      [item.video_url, item.video_title, item.video_source, item.movie_id, room.id]
    );
    await client.query("COMMIT");
    return { room: updatedRes.rows[0], item };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function restoreOriginalRoomVideo(code, hostId) {
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const roomRes = await client.query(`SELECT * FROM rooms WHERE code = $1 FOR UPDATE`, [code]);
    const room = roomRes.rows[0];
    if (!room || room.host_id !== hostId) {
      await client.query("ROLLBACK");
      return { error: "Only the host can play the original video" };
    }
    const updatedRes = await client.query(
      `UPDATE rooms SET
        video_url = original_video_url, video_title = original_video_title, video_source = original_video_source, movie_id = original_movie_id,
        current_video_url = original_video_url, current_video_title = original_video_title, current_video_source = original_video_source, current_movie_id = original_movie_id
       WHERE id = $1 RETURNING *`,
      [room.id]
    );
    await client.query("COMMIT");
    return { room: updatedRes.rows[0] };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function playNextRoomQueueItem(code, hostId) {
  await ensureSchema();
  const room = await getRoomByCode(code);
  if (!room || room.host_id !== hostId) return { error: "Only the host can play the next video" };
  const next = (await listRoomQueue(code))[0];
  if (!next) return { error: "The queue is empty" };
  return setRoomCurrentVideoFromQueue(code, hostId, next.id);
}

async function removeRoomQueueItem(idValue, userId, code) {
  await ensureSchema();
  const room = await getRoomByCode(String(code || '').toUpperCase());
  if (!room) return null;

  // Any user who is actually in the room may explicitly remove a queued item.
  // Playing an item never removes it; only this explicit DELETE does.
  const active = await isActiveRoomMember(room.code, userId);
  if (!active && room.host_id !== userId) return null;

  const { rows } = await pool.query(
    `DELETE FROM room_queue
     WHERE id = $1 AND room_id = $2 AND status = 'queued'
     RETURNING *`,
    [idValue, room.id]
  );
  return rows[0] || null;
}

async function createStorageUpload({ id, ownerId, folderId, uploadLinkId = null, code, objectName, size, progressHash }) {
  await ensureSchema();
  await pool.query(
    `INSERT INTO storage_uploads (id, owner_id, folder_id, uploadlink_id, code, object_name, size, progress_hash, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, ownerId, folderId, uploadLinkId, code, objectName, size, progressHash, Date.now()]
  );
  return getStorageUpload(id, ownerId);
}

async function getStorageUpload(idValue, ownerId) {
  await ensureSchema();
  const { rows } = await pool.query(`SELECT * FROM storage_uploads WHERE id = $1 AND owner_id = $2`, [idValue, ownerId]);
  return rows[0] || null;
}

async function deleteStorageUpload(idValue, ownerId) {
  await ensureSchema();
  await pool.query(`DELETE FROM storage_uploads WHERE id = $1 AND owner_id = $2`, [idValue, ownerId]);
}

async function createNotification(userId, { type, title, message, roomCode = null, roomName = null, videoTitle = null }) {
  await ensureSchema();
  const { rows } = await pool.query(`INSERT INTO notifications (id,user_id,type,title,message,room_code,room_name,video_title,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [id(), userId, type, title, message, roomCode, roomName, videoTitle, Date.now()]);
  return rows[0] || null;
}
async function listNotifications(userId, limit = 50) {
  await ensureSchema(); const safe = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const { rows } = await pool.query(`SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`, [userId, safe]); return rows;
}
async function getUnreadNotificationCount(userId) {
  await ensureSchema(); const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM notifications WHERE user_id=$1 AND read_at IS NULL`, [userId]); return rows[0]?.count || 0;
}
async function markNotificationRead(userId, notificationId) {
  await ensureSchema(); const { rows } = await pool.query(`UPDATE notifications SET read_at=COALESCE(read_at,$3) WHERE id=$1 AND user_id=$2 RETURNING *`, [notificationId, userId, Date.now()]); return rows[0] || null;
}
async function markAllNotificationsRead(userId) {
  await ensureSchema(); await pool.query(`UPDATE notifications SET read_at=COALESCE(read_at,$2) WHERE user_id=$1 AND read_at IS NULL`, [userId, Date.now()]);
}
async function listRoomHistoryForUser(userId, limit = 50) {
  await ensureSchema(); const safe = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const { rows } = await pool.query(`SELECT * FROM room_history WHERE host_id=$1 OR participants @> $2::jsonb ORDER BY ended_at DESC LIMIT $3`, [userId, JSON.stringify([{ id: userId }]), safe]); return rows;
}


/* =========================================================
   ACCOUNT DELETION
========================================================= */

async function deleteUserAccount(userId) {
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const userRes = await client.query(
      `SELECT id, username, email, avatar_url FROM users WHERE id=$1 FOR UPDATE`,
      [userId]
    );
    const user = userRes.rows[0];
    if (!user) {
      await client.query("ROLLBACK");
      return null;
    }

    // Hosted rooms must be ended before deleting the user because rooms.host_id
    // is intentionally non-cascading. Their history is kept for other viewers.
    const hosted = await client.query(
      `SELECT id, code, name, video_title, video_url, video_source,
              current_video_title, current_video_url, current_video_source,
              playback_time, host_id
         FROM rooms WHERE host_id=$1`,
      [userId]
    );

    for (const room of hosted.rows) {
      const participantsRes = await client.query(
        `SELECT rm.user_id AS id, u.username, (r.host_id=rm.user_id) AS is_host
           FROM room_members rm
           JOIN rooms r ON r.id=rm.room_id
           JOIN users u ON u.id=rm.user_id
          WHERE r.id=$1`,
        [room.id]
      );
      const participants = participantsRes.rows;
      if (!participants.some((p) => String(p.id) === String(userId))) {
        participants.unshift({ id: userId, username: user.username, is_host: true });
      }

      const chatRes = await client.query(
        `SELECT id,user_id,username,message,created_at FROM room_messages WHERE room_id=$1 ORDER BY created_at ASC`,
        [room.id]
      );

      await client.query(
        `INSERT INTO room_history
          (id,room_id,code,name,host_id,host_username,video_title,video_url,video_source,playback_time,ended_at,participants,chat)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb)`,
        [
          id(), room.id, room.code, room.name, "deleted-user", "Deleted user",
          room.current_video_title || room.video_title || "Untitled screening",
          room.current_video_url || room.video_url,
          room.current_video_source || room.video_source,
          Number(room.playback_time || 0), Date.now(),
          JSON.stringify(participants.map((p) => String(p.id) === String(userId) ? { ...p, id: "deleted-user", username: "Deleted user" } : p)),
          JSON.stringify(chatRes.rows.map((m) => String(m.user_id) === String(userId) ? { ...m, user_id: "deleted-user", username: "Deleted user" } : m)),
        ]
      );

      await client.query(`DELETE FROM rooms WHERE id=$1`, [room.id]);
    }

    // A deleted user's queue entries cannot keep the user FK alive. Remove
    // those entries and detach references to the user's library movies from
    // rooms/queue items that belong to somebody else's room.
    await client.query(`DELETE FROM room_queue WHERE added_by=$1`, [userId]);
    await client.query(`UPDATE room_queue SET movie_id=NULL WHERE movie_id IN (SELECT id FROM movies WHERE owner_id=$1)`, [userId]);
    await client.query(`UPDATE rooms SET movie_id=NULL, original_movie_id=NULL, current_movie_id=NULL WHERE movie_id IN (SELECT id FROM movies WHERE owner_id=$1) OR original_movie_id IN (SELECT id FROM movies WHERE owner_id=$1) OR current_movie_id IN (SELECT id FROM movies WHERE owner_id=$1)`, [userId]);

    // Remove the user's library records. The API layer deletes the actual
    // pCloud objects before this transaction is committed.
    await client.query(`DELETE FROM movies WHERE owner_id=$1`, [userId]);

    // Remove all remaining personal data that is linked by foreign keys.
    await client.query(`DELETE FROM users WHERE id=$1`, [userId]);
    await client.query("COMMIT");
    return { ok: true, user };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  createUser,
  deleteUserAccount,
  getUserByEmail,
  getUserById,
  getUserAuthById,
  updateUserProfileSafe,
  setVerificationToken,
  setPasswordResetToken,
  resetPasswordByTokenHash,
  updateUserPassword,
  verifyUserByTokenHash,
  getUserByUsername,
  createRoom,
  createNotification, listNotifications, getUnreadNotificationCount, markNotificationRead, markAllNotificationsRead, listRoomHistoryForUser,
  getRoomByCode,
  listRoomsForUser,
  addRoomAccess,
  removeRoomAccess,
  deleteRoom,
  updateRoomCapacity,
  createMovie,
  createMovieIfMissing,
  listMoviesForUser,
  getMovieById,
  deleteMovie,
  reserveRoomSeat,
  touchRoomMember,
  releaseRoomMember,
  getRoomOccupancy,
  getActiveRoomMembers,
  isActiveRoomMember,
  createRoomSignal,
  listRoomSignals,
  updateRoomPlaybackState,
  createRoomMessage,
  listRoomMessages,
  addRoomQueueItem,
  listRoomQueue,
  playNextRoomQueueItem,
  setRoomCurrentVideoFromQueue,
  restoreOriginalRoomVideo,
  removeRoomQueueItem,
  createStorageUpload,
  getStorageUpload,
  deleteStorageUpload,
};
