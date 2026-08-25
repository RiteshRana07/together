import { NextResponse } from "next/server";
import { cookies } from "next/headers";
const { verifyToken } = require("../../../../lib/auth");
const { getMovieById, getRoomByCode, isActiveRoomMember } = require("../../../../lib/db");
const { isPCloudRef, fileIdFromRef, getFreshPlayableVideoLink } = require("../../../../lib/pcloud");

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
  if (value) out[name] = value;
}

async function fetchPCloud(url, range, method) {
  const headers = { Accept: "video/mp4,video/*;q=0.9,*/*;q=0.8" };
  if (range) headers.Range = range;
  // The pCloud content URL is fetched server-side. The browser therefore does
  // not need to satisfy pCloud's web-app referrer restriction.
  const response = await fetch(url, {
    method,
    headers,
    redirect: "follow",
    cache: "no-store",
  });
  return response;
}

async function stream(request) {
  const resolved = await resolveStorageRef(request.url);
  if (resolved.error) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

  const fileId = fileIdFromRef(resolved.ref);
  if (!fileId) return NextResponse.json({ error: "Invalid pCloud storage reference" }, { status: 400 });

  const range = request.headers.get("range");
  const method = request.method === "HEAD" ? "HEAD" : "GET";
  let upstreamUrl = await getFreshPlayableVideoLink(fileId);
  let upstream = await fetchPCloud(upstreamUrl, range, method);

  // pCloud content links are short-lived. If a link expires between generation
  // and the browser request, obtain a brand-new link and retry once.
  if (upstream.status === 410 || upstream.status === 403) {
    upstreamUrl = await getFreshPlayableVideoLink(fileId);
    upstream = await fetchPCloud(upstreamUrl, range, method);
  }

  if (![200, 206].includes(upstream.status)) {
    const text = await upstream.text().catch(() => "");
    console.error("[storage stream] pCloud upstream failure", upstream.status, text.slice(0, 300));
    return NextResponse.json({ error: `pCloud video server returned ${upstream.status}` }, { status: 502 });
  }

  const out = new Headers();
  copyHeader(upstream.headers, "content-type", out);
  copyHeader(upstream.headers, "content-length", out);
  copyHeader(upstream.headers, "content-range", out);
  copyHeader(upstream.headers, "accept-ranges", out);
  copyHeader(upstream.headers, "etag", out);
  copyHeader(upstream.headers, "last-modified", out);
  out.set("Cache-Control", "private, no-store, max-age=0");
  out.set("X-Content-Type-Options", "nosniff");
  out.set("Content-Disposition", "inline");

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
