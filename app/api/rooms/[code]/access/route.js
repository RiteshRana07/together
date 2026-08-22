import { NextResponse } from "next/server";
import { cookies } from "next/headers";
const { verifyToken } = require("../../../../../lib/auth");
const { getRoomByCode, removeRoomAccess } = require("../../../../../lib/db");

function requireUser() {
  const token = cookies().get("wt_session")?.value;
  return token && verifyToken(token);
}

export async function DELETE(req, { params }) {
  const payload = requireUser();
  if (!payload) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const code = params.code.toUpperCase();
  const room = await getRoomByCode(code);
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  if (room.host_id === payload.userId) {
    return NextResponse.json({ error: "The host must delete the room itself" }, { status: 400 });
  }
  await removeRoomAccess(code, payload.userId);
  return NextResponse.json({ ok: true });
}
