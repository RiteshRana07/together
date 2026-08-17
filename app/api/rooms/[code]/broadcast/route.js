import { NextResponse } from "next/server";
import { cookies } from "next/headers";
const pusher = require("../../../../../lib/pusher");
const { verifyToken } = require("../../../../../lib/auth");
const { getRoomByCode } = require("../../../../../lib/db");

const ALLOWED_EVENTS = [
  "player:action",
  "player:heartbeat",
  "chat:message",
  "reaction:show",
  "player:request-sync",
];

const HOST_ONLY_EVENTS = ["player:action", "player:heartbeat"];
const EXCLUDE_SENDER_EVENTS = ["player:action", "player:heartbeat"];

export async function POST(req, { params }) {
  const code = params.code.toUpperCase();
  const { event, data, socketId } = await req.json();

  if (!ALLOWED_EVENTS.includes(event)) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }

  const token = cookies().get("wt_session")?.value;
  const payload = token && verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const room = await getRoomByCode(code);
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  // Playback is host-controlled, regardless of whether the host is currently
  // connected to the room. The client UI is not a security boundary.
  if (HOST_ONLY_EVENTS.includes(event) && payload.userId !== room.host_id) {
    return NextResponse.json({ error: "Only the host can control playback" }, { status: 403 });
  }

  const safePayload =
    event === "chat:message"
      ? { ...data, message: String(data?.message || "").slice(0, 500) }
      : data || {};

  const options = EXCLUDE_SENDER_EVENTS.includes(event) && socketId
    ? { socket_id: socketId }
    : undefined;

  await pusher.trigger(`presence-room-${code}`, event, safePayload, options);
  return NextResponse.json({ ok: true });
}
