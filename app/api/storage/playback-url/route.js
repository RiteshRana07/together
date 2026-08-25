import { NextResponse } from "next/server";
import { cookies } from "next/headers";
const { verifyToken } = require("../../../../lib/auth");
const { getRoomByCode, isActiveRoomMember } = require("../../../../lib/db");
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

export async function GET(request) {
  try {
    const user = getUser();
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const parsed = new URL(request.url);
    const roomCode = String(parsed.searchParams.get("room") || "").trim().toUpperCase();
    const ref = String(parsed.searchParams.get("v") || "").trim();

    if (!roomCode || !ref || !isPCloudRef(ref)) {
      return NextResponse.json({ error: "A room and valid pCloud reference are required" }, { status: 400 });
    }

    const room = await getRoomByCode(roomCode);
    if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
    const allowed = room.host_id === user.userId || await isActiveRoomMember(roomCode, user.userId);
    if (!allowed) return NextResponse.json({ error: "Not an active room member" }, { status: 403 });

    const fileId = fileIdFromRef(ref);
    if (!fileId) return NextResponse.json({ error: "Invalid pCloud reference" }, { status: 400 });

    const url = await getFileLink(fileId);
    return NextResponse.json({ ok: true, url, source: "pcloud-direct" }, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (error) {
    console.error("[storage playback-url]", error);
    return NextResponse.json({ error: error?.message || "Could not create playback URL" }, { status: 500 });
  }
}
