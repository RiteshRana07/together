import { NextResponse } from "next/server";
import { cookies } from "next/headers";
const { verifyToken } = require("../../../lib/auth");
const { createRoom, listRoomsForUser, getMovieById } = require("../../../lib/db");
const { resolveMediaInput } = require("../../../lib/media");

function requireUser() {
  const token = cookies().get("wt_session")?.value;
  return token && verifyToken(token);
}

function parseCapacity(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 500) return null;
  return n;
}

export async function GET() {
  const payload = requireUser();
  if (!payload) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({ rooms: await listRoomsForUser(payload.userId) });
}

export async function POST(req) {
  const payload = requireUser();
  if (!payload) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { name, source, movieId, videoUrl, maxParticipants } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Room name is required" }, { status: 400 });

  const cap = parseCapacity(maxParticipants);
  if (!cap) {
    return NextResponse.json({ error: "Choose a room size between 1 and 500" }, { status: 400 });
  }

  let room;
  if (source === "library") {
    if (!movieId) return NextResponse.json({ error: "Pick a movie from your library" }, { status: 400 });
    const movie = await getMovieById(movieId, payload.userId);
    if (!movie) return NextResponse.json({ error: "Movie not found in your library" }, { status: 404 });
    room = await createRoom({
      name: name.trim(),
      videoUrl: movie.video_url,
      videoTitle: movie.title,
      videoSource: "library",
      movieId: movie.id,
      maxParticipants: cap,
      hostId: payload.userId,
    });
  } else {
    if (!videoUrl?.trim()) return NextResponse.json({ error: "Paste a video URL" }, { status: 400 });
    const resolved = await resolveMediaInput(videoUrl.trim());
    if (!resolved) return NextResponse.json({ error: "Use a YouTube, Google Drive, or direct video URL" }, { status: 400 });
    room = await createRoom({
      name: name.trim(),
      videoUrl: resolved.videoUrl,
      videoTitle: resolved.videoTitle,
      videoSource: resolved.videoSource,
      maxParticipants: cap,
      hostId: payload.userId,
    });
  }

  return NextResponse.json({ room });
}
