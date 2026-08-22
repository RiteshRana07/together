import { NextResponse } from "next/server";
import { cookies } from "next/headers";
const { verifyToken } = require("../../../../../../lib/auth");
const { restoreOriginalRoomVideo, updateRoomPlaybackState } = require("../../../../../../lib/db");
const { isPCloudRef } = require("../../../../../../lib/pcloud");
const pusher = require("../../../../../../lib/pusher");

export async function POST(req, { params }) {
  const token = cookies().get("wt_session")?.value;
  const user = token && verifyToken(token);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const code = params.code.toUpperCase();
  const result = await restoreOriginalRoomVideo(code, user.userId);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 403 });

  const room = result.room;
  await updateRoomPlaybackState(code, user.userId, { time: 0, playing: true });
  const rawVideoUrl = room.current_video_url || room.video_url;
  const playableVideoUrl = isPCloudRef(rawVideoUrl)
    ? `/api/storage/stream?room=${encodeURIComponent(code)}&v=${encodeURIComponent(rawVideoUrl)}`
    : rawVideoUrl;

  try{await pusher.trigger(`presence-room-${code}`, "room:video-changed", {
    videoUrl: playableVideoUrl,
    videoRef: room.current_video_url || room.video_url,
    videoTitle: room.current_video_title || room.video_title,
    videoSource: room.current_video_source || room.video_source,
    originalVideoUrl: room.original_video_url,
    autoplay: true,
  });}catch(error){console.warn("[queue] realtime publish unavailable",error?.message||error)}

  return NextResponse.json({ ok: true, room, playableVideoUrl, videoRef: room.current_video_url || room.video_url });
}
