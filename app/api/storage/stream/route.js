import { NextResponse } from "next/server";
import { cookies } from "next/headers";
const { verifyToken } = require("../../../../lib/auth");
const { getMovieById, getRoomByCode } = require("../../../../lib/db");
const { isPCloudRef, fileIdFromRef, getFileLink } = require("../../../../lib/pcloud");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getUser() {
  try {
    const token = cookies().get("wt_session")?.value;
    return token ? verifyToken(token) : null;
  } catch {
    return null;
  }
}

async function resolveStorageRef(requestUrl) {
  const parsed = new URL(requestUrl);
  const movieId = parsed.searchParams.get("movieId");
  const roomCode = parsed.searchParams.get("room");
  const user = getUser();

  if (!user) return { error: "Not signed in", status: 401 };

  if (movieId) {
    const movie = await getMovieById(movieId, user.userId);
    if (!movie || !isPCloudRef(movie.video_url)) {
      return { error: "Movie not found", status: 404 };
    }
    return { ref: movie.video_url };
  }

  if (roomCode) {
    const room = await getRoomByCode(roomCode.toUpperCase());
    if (!room) return { error: "Room not found", status: 404 };
    const ref = room.current_video_url || room.video_url;
    if (!isPCloudRef(ref)) {
      return { error: "Room video is not a pCloud file", status: 400 };
    }
    return { ref };
  }

  return { error: "A movieId or room is required", status: 400 };
}

export async function GET(request) {
  try {
    const resolved = await resolveStorageRef(request.url);
    if (resolved.error) {
      return NextResponse.json(
        { error: resolved.error },
        { status: resolved.status }
      );
    }

    const fileId = fileIdFromRef(resolved.ref);
    if (!fileId) {
      return NextResponse.json(
        { error: "Invalid pCloud storage reference" },
        { status: 400 }
      );
    }

    // The browser never talks directly to pCloud. Railway obtains a fresh
    // pCloud content URL for every range request and proxies the bytes back.
    // This makes playback same-origin and reliable across browsers/devices.
    const upstreamUrl = await getFileLink(fileId);
    const range = request.headers.get("range");
    const upstreamHeaders = {};
    if (range) upstreamHeaders.Range = range;

    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: upstreamHeaders,
      cache: "no-store",
      redirect: "follow",
    });

    if (!upstream.ok && upstream.status !== 206) {
      const error = new Error(`pCloud video stream failed (${upstream.status})`);
      error.code = upstream.status;
      throw error;
    }

    const headers = new Headers();
    for (const name of [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "etag",
      "last-modified",
    ]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }

    if (!headers.has("accept-ranges")) headers.set("accept-ranges", "bytes");
    if (!headers.has("content-type")) headers.set("content-type", "video/mp4");
    headers.set("Cache-Control", "private, no-store, max-age=0");

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    console.error("[storage stream]", error);
    const status = Number(error?.code);
    return NextResponse.json(
      { error: error?.message || "Video stream unavailable" },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}
