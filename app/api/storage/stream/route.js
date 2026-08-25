import { NextResponse } from "next/server";
import { cookies } from "next/headers";
const { verifyToken } = require("../../../../lib/auth");
const { getMovieById, getRoomByCode, isActiveRoomMember } = require("../../../../lib/db");
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
    const code = roomCode.toUpperCase();
    const room = await getRoomByCode(code);
    if (!room) return { error: "Room not found", status: 404 };

    const allowed = room.host_id === user.userId || await isActiveRoomMember(code, user.userId);
    if (!allowed) return { error: "You must join the room before playing its video", status: 403 };

    const requestedRef = parsed.searchParams.get("v");
    const ref = requestedRef && isPCloudRef(requestedRef)
      ? requestedRef
      : (room.current_video_url || room.video_url);

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
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const fileId = fileIdFromRef(resolved.ref);
    if (!fileId) {
      return NextResponse.json({ error: "Invalid pCloud storage reference" }, { status: 400 });
    }

    // Do not proxy multi-GB video through Railway. Authenticate the request
    // here, obtain a short-lived pCloud content URL, then let the browser
    // stream the bytes directly from pCloud. The browser follows the redirect
    // for range requests as well, avoiding the lag caused by Railway acting as
    // a video proxy.
    const upstreamUrl = await getFileLink(fileId);
    return NextResponse.redirect(upstreamUrl, {
      status: 302,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
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
