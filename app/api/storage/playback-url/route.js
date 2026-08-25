import { NextResponse } from "next/server";
import { cookies } from "next/headers";
const { verifyToken } = require("../../../../lib/auth");
const { getMovieById, getRoomByCode, isActiveRoomMember } = require("../../../../lib/db");
const { isPCloudRef, fileIdFromRef, getPlayableVideoLink } = require("../../../../lib/pcloud");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function currentUser() {
  try {
    const token = cookies().get("wt_session")?.value;
    return token ? verifyToken(token) : null;
  } catch {
    return null;
  }
}

async function resolveRef(requestUrl) {
  const parsed = new URL(requestUrl);
  const user = currentUser();
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

  const requested = parsed.searchParams.get("v");
  const ref = requested && isPCloudRef(requested) ? requested : (room.current_video_url || room.video_url);
  if (!isPCloudRef(ref)) return { error: "Room video is not a pCloud file", status: 400 };
  return { ref };
}

export async function GET(request) {
  try {
    const resolved = await resolveRef(request.url);
    if (resolved.error) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

    const fileId = fileIdFromRef(resolved.ref);
    if (!fileId) return NextResponse.json({ error: "Invalid pCloud storage reference" }, { status: 400 });

    // Return the short-lived pCloud playback URL directly as JSON. This avoids
    // a Next.js redirect sitting between the HTML5 video element and pCloud.
    // getPlayableVideoLink prefers pCloud's H.264/AAC MP4 variants and falls
    // back to the original file link when transcoded variants are unavailable.
    const url = await getPlayableVideoLink(fileId);
    return NextResponse.json({ url, fileId: String(fileId), expiresAt: Date.now() + 4 * 60 * 1000 }, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    console.error("[storage playback-url]", error);
    const status = Number(error?.status || error?.code);
    return NextResponse.json(
      { error: error?.message || "Video playback URL unavailable" },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}
