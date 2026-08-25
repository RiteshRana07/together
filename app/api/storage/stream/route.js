import { NextResponse } from "next/server";
import { cookies } from "next/headers";
const { verifyToken } = require("../../../../lib/auth");
const { getMovieById, getRoomByCode, isActiveRoomMember } = require("../../../../lib/db");
const { isPCloudRef, fileIdFromRef, getFreshPlayableVideoLink, getPlayableVideoSource } = require("../../../../lib/pcloud");

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

function copyHeader(headers, name, out) {
  const value = headers.get(name);
  if (value) out.set(name, value);
}

function parseRange(range) {
  if (!range) return null;
  const m = /^bytes=(\d+)-(\d*)$/i.exec(range.trim());
  if (!m) return null;
  return { start: Number(m[1]), end: m[2] === "" ? null : Number(m[2]) };
}

async function fetchPCloud(url, range, method) {
  const headers = { Accept: "video/mp4,video/*;q=0.9,*/*;q=0.8", "Accept-Encoding": "identity" };
  if (range) headers.Range = range;
  return fetch(url, { method, headers, redirect: "follow", cache: "no-store" });
}

async function getFreshSource(fileId) {
  // Prefer an explicitly browser-compatible MP4 variant. pCloud's
  // getvideolinks returns codec metadata; never silently choose an unknown
  // codec just because it is the largest variant.
  if (typeof getPlayableVideoSource === "function") {
    const source = await getPlayableVideoSource(fileId);
    if (source?.url) return source;
  }
  return { url: await getFreshPlayableVideoLink(fileId), codec: "unknown" };
}

async function stream(request) {
  const resolved = await resolveStorageRef(request.url);
  if (resolved.error) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

  const fileId = fileIdFromRef(resolved.ref);
  if (!fileId) return NextResponse.json({ error: "Invalid pCloud storage reference" }, { status: 400 });

  const range = request.headers.get("range");
  const requested = parseRange(range);
  const method = request.method === "HEAD" ? "HEAD" : "GET";
  let source = await getFreshSource(fileId);
  let upstream = await fetchPCloud(source.url, range, method);

  // pCloud links are temporary. Refresh the link, but preserve the browser's
  // original Range request so media seeking remains correct.
  if (upstream.status === 403 || upstream.status === 404 || upstream.status === 410) {
    source = await getFreshSource(fileId);
    upstream = await fetchPCloud(source.url, range, method);
  }

  if (![200, 206].includes(upstream.status)) {
    const text = await upstream.text().catch(() => "");
    console.error("[storage stream] pCloud upstream failure", upstream.status, text.slice(0, 500));
    return NextResponse.json({ error: `pCloud video server returned ${upstream.status}` }, { status: 502 });
  }

  const out = new Headers();
  copyHeader(upstream.headers, "content-type", out);
  copyHeader(upstream.headers, "etag", out);
  copyHeader(upstream.headers, "last-modified", out);
  out.set("Accept-Ranges", "bytes");
  out.set("Cache-Control", "private, no-store, max-age=0");
  out.set("X-Content-Type-Options", "nosniff");
  out.set("Content-Disposition", "inline");
  out.set("X-WatchTogether-Video-Codec", String(source.codec || "unknown"));

  // Chrome/Edge will reject an invalid 206 response. Some pCloud content
  // servers have returned 206 without a Content-Range header. Preserve a
  // valid upstream Content-Range when present; otherwise fail clearly rather
  // than handing the browser a malformed media response.
  const upstreamRange = upstream.headers.get("content-range");
  if (upstream.status === 206 && !upstreamRange) {
    const length = Number(upstream.headers.get("content-length") || 0);
    if (requested && Number.isFinite(length) && length > 0) {
      const end = requested.end == null ? requested.start + length - 1 : requested.end;
      out.set("Content-Range", `bytes ${requested.start}-${end}/*`);
    } else {
      console.error("[storage stream] pCloud returned 206 without Content-Range");
      return NextResponse.json({ error: "pCloud returned an invalid partial video response" }, { status: 502 });
    }
  } else if (upstreamRange) {
    out.set("Content-Range", upstreamRange);
  }

  const contentLength = upstream.headers.get("content-length");
  if (contentLength) out.set("Content-Length", contentLength);

  return new Response(method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: out,
  });
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
