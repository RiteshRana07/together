import { NextResponse } from "next/server";
import { cookies } from "next/headers";
const { verifyToken } = require("../../../../lib/auth");
const { getMovieById, getRoomByCode, isActiveRoomMember } = require("../../../../lib/db");
const { isPCloudRef, fileIdFromRef, getFreshFileLink, getFreshPlayableVideoLink } = require("../../../../lib/pcloud");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function getUser() {
  try {
    const token = cookies().get("wt_session")?.value;
    return token ? verifyToken(token) : null;
  } catch { return null; }
}

async function resolveStorageRef(requestUrl) {
  const parsed = new URL(requestUrl);
  const user = getUser();
  if (!user) return { error: "Not signed in", status: 401 };

  const movieId = parsed.searchParams.get("movieId");
  if (movieId) {
    const movie = await getMovieById(movieId, user.userId);
    if (!movie || !isPCloudRef(movie.video_url)) return { error: "Movie not found", status: 404 };
    return { ref: movie.video_url };
  }

  const roomCode = parsed.searchParams.get("room");
  if (!roomCode) return { error: "A movieId or room is required", status: 400 };
  const code = roomCode.toUpperCase();
  const room = await getRoomByCode(code);
  if (!room) return { error: "Room not found", status: 404 };
  const allowed = room.host_id === user.userId || await isActiveRoomMember(code, user.userId);
  if (!allowed) return { error: "You must join the room before playing its video", status: 403 };

  const requestedRef = parsed.searchParams.get("v");
  const ref = requestedRef && isPCloudRef(requestedRef)
    ? requestedRef
    : (room.current_video_url || room.video_url);
  if (!isPCloudRef(ref)) return { error: "Room video is not a pCloud file", status: 400 };
  return { ref };
}

function parseRange(value) {
  if (!value) return null;
  const m = /^bytes=(\d+)-(\d*)$/i.exec(String(value).trim());
  if (!m) return null;
  const start = Number(m[1]);
  const end = m[2] === "" ? null : Number(m[2]);
  if (!Number.isSafeInteger(start) || (end !== null && !Number.isSafeInteger(end)) || (end !== null && end < start)) return null;
  return { start, end };
}

function copyIfPresent(source, target, name) {
  const value = source.get(name);
  if (value) target.set(name, value);
}

async function fetchPCloud(url, range, method = "GET") {
  const headers = {
    Accept: "video/mp4,video/*;q=0.9,*/*;q=0.8",
    "Accept-Encoding": "identity",
    // pCloud's API docs restrict the API methods themselves to pcloud.com,
    // while the generated content URL is fetched here server-side. Keeping
    // this referrer on the server avoids exposing the temporary URL to Chrome.
    Referer: "https://my.pcloud.com/",
    Origin: "https://my.pcloud.com",
    "User-Agent": "WatchTogether/43",
  };
  if (range) headers.Range = `bytes=${range.start}-${range.end === null ? "" : range.end}`;
  return fetch(url, {
    method,
    headers,
    redirect: "follow",
    cache: "no-store",
  });
}

async function makeSource(fileId, transcoded = false) {
  if (transcoded) return getFreshPlayableVideoLink(fileId);
  return getFreshFileLink(fileId);
}

function responseHeaders(upstream, range) {
  const h = new Headers();
  const type = upstream.headers.get("content-type") || "video/mp4";
  h.set("Content-Type", type.split(";")[0]);
  copyIfPresent(upstream.headers, h, "etag");
  copyIfPresent(upstream.headers, h, "last-modified");
  copyIfPresent(upstream.headers, h, "content-range");
  h.set("Accept-Ranges", "bytes");
  h.set("Content-Disposition", "inline");
  h.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  h.set("Pragma", "no-cache");
  h.set("X-Content-Type-Options", "nosniff");
  return h;
}

async function stream(request) {
  const resolved = await resolveStorageRef(request.url);
  if (resolved.error) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

  const fileId = fileIdFromRef(resolved.ref);
  if (!fileId) return NextResponse.json({ error: "Invalid pCloud storage reference" }, { status: 400 });

  const range = parseRange(request.headers.get("range"));
  const method = request.method === "HEAD" ? "HEAD" : "GET";

  // IMPORTANT: use a fresh ORIGINAL file link first. This is the same pCloud
  // file that works in the user's localhost v34 build. We only fall back to
  // the transcoded getvideolinks variant if the original content cannot be
  // fetched or is not a playable response.
  let transcoded = false;
  let source = await makeSource(fileId, false);
  let upstream = await fetchPCloud(source, range, method);

  if ([403, 404, 410].includes(upstream.status)) {
    source = await makeSource(fileId, false);
    upstream = await fetchPCloud(source, range, method);
  }

  // If the original file is unavailable as a media response, try pCloud's
  // transcoded H.264/AAC/MP3 variant once.
  if (![200, 206].includes(upstream.status)) {
    transcoded = true;
    source = await makeSource(fileId, true);
    upstream = await fetchPCloud(source, range, method);
  }

  if (![200, 206].includes(upstream.status)) {
    const text = await upstream.text().catch(() => "");
    console.error("[storage stream] pCloud failure", {
      status: upstream.status,
      fileId: String(fileId),
      range: request.headers.get("range") || null,
      body: text.slice(0, 400),
    });
    return NextResponse.json({ error: `pCloud video server returned ${upstream.status}` }, { status: 502 });
  }

  // HEAD: return metadata without consuming a media body.
  if (method === "HEAD") {
    const headers = responseHeaders(upstream, range);
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);
    return new Response(null, { status: upstream.status, headers });
  }

  const headers = responseHeaders(upstream, range);
  const upstreamRange = upstream.headers.get("content-range");
  const upstreamLength = Number(upstream.headers.get("content-length") || 0);

  // Browser media elements are strict about 206 responses. If pCloud omitted
  // Content-Range, reconstruct it only when the requested range and response
  // length make the result unambiguous.
  if (upstream.status === 206 && !upstreamRange && range && upstreamLength > 0) {
    const end = range.end === null ? range.start + upstreamLength - 1 : range.end;
    headers.set("Content-Range", `bytes ${range.start}-${end}/*`);
  }

  if (upstreamRange) headers.set("Content-Range", upstreamRange);
  if (upstreamLength > 0) headers.set("Content-Length", String(upstreamLength));

  // For ranged requests, buffer only that requested chunk before returning it.
  // This avoids Railway/Next altering a chunked upstream stream and guarantees
  // that Content-Length exactly matches the bytes Chrome receives. Typical
  // browser video ranges are small (hundreds of KB to a few MB).
  if (range) {
    const bytes = new Uint8Array(await upstream.arrayBuffer());
    let body = bytes;
    let status = upstream.status;

    // Some upstream servers can ignore Range and answer 200. If the returned
    // body is the complete file and the requested start is non-zero, slice the
    // requested bytes. Never attempt to slice an enormous response blindly.
    if (status === 200 && range.start > 0) {
      if (bytes.byteLength > 64 * 1024 * 1024) {
        return NextResponse.json({ error: "pCloud ignored the requested byte range" }, { status: 502 });
      }
      const end = range.end === null ? bytes.byteLength - 1 : Math.min(range.end, bytes.byteLength - 1);
      body = bytes.slice(range.start, end + 1);
      status = 206;
      headers.set("Content-Range", `bytes ${range.start}-${range.start + body.byteLength - 1}/${bytes.byteLength}`);
    }

    headers.set("Content-Length", String(body.byteLength));
    return new Response(body, { status, headers });
  }

  // Non-range requests can be streamed without buffering the whole movie.
  return new Response(upstream.body, { status: upstream.status, headers });
}

export async function GET(request) {
  try { return await stream(request); }
  catch (error) {
    console.error("[storage stream]", error);
    return NextResponse.json({ error: error?.message || "Video stream unavailable" }, { status: 502 });
  }
}

export async function HEAD(request) {
  try { return await stream(request); }
  catch (error) {
    console.error("[storage stream HEAD]", error);
    return new Response(null, { status: 502 });
  }
}
