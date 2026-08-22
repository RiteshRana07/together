import { NextResponse } from "next/server";
import { cookies } from "next/headers";
const { verifyToken } = require("../../../../../lib/auth");
const { getRoomByCode, addRoomQueueItem, listRoomQueue, removeRoomQueueItem } = require("../../../../../lib/db");
const { resolveMediaInput } = require("../../../../../lib/media");
const { isPCloudRef, signDownload } = require("../../../../../lib/pcloud");
const pusher = require("../../../../../lib/pusher");

function requireUser() {
  const token = cookies().get("wt_session")?.value;
  return token && verifyToken(token);
}

async function resolveVideo(videoUrl) {
  return resolveMediaInput(videoUrl);
}

export async function GET(req, { params }) {
  const user = requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const code = params.code.toUpperCase();
  const room = await getRoomByCode(code);
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  const queue = await listRoomQueue(code);
  const playableQueue = await Promise.all(queue.map(async (item) => ({
    ...item,
    playable_video_url: isPCloudRef(item.video_url) ? `/api/storage/stream?room=${encodeURIComponent(code)}&v=${encodeURIComponent(item.video_url)}` : item.video_url,
  })));
  return NextResponse.json({ queue: playableQueue });
}

export async function POST(req, { params }) {
  const user = requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const code = params.code.toUpperCase();
  const room = await getRoomByCode(code);
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const { videoUrl } = await req.json();
  const resolved = await resolveVideo(videoUrl);
  if (!resolved) return NextResponse.json({ error: "Enter a valid YouTube, Google Drive, or direct video URL" }, { status: 400 });

  const item = await addRoomQueueItem({ code, addedBy: user.userId, ...resolved });
  await pusher.trigger(`presence-room-${code}`, "room:queue-changed", {});
  return NextResponse.json({ item });
}

export async function DELETE(req, { params }) {
  const user = requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing queue item id" }, { status: 400 });
  const item = await removeRoomQueueItem(id, user.userId, params.code);
  if (!item) return NextResponse.json({ error: "Queue item not found" }, { status: 404 });
  await pusher.trigger(`presence-room-${params.code.toUpperCase()}`, "room:queue-changed", {});
  return NextResponse.json({ ok: true });
}
