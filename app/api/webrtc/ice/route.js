import { NextResponse } from "next/server";
import { cookies } from "next/headers";
const { verifyToken } = require("../../../../lib/auth");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sessionUser(){
  const token=cookies().get("wt_session")?.value;
  return token ? verifyToken(token) : null;
}

// 100% free configuration: STUN only. No Cloudflare TURN, no paid relay,
// and no TURN credentials are ever requested. WebRTC will attempt direct
// peer-to-peer connectivity. Some restrictive networks may require TURN;
// those networks cannot be guaranteed to connect with a STUN-only design.
const FREE_STUN_SERVERS=[
  {urls:"stun:stun.l.google.com:19302"},
  {urls:"stun:stun1.l.google.com:19302"},
  {urls:"stun:stun2.l.google.com:19302"},
  {urls:"stun:stun3.l.google.com:19302"},
  {urls:"stun:stun4.l.google.com:19302"},
];

export async function GET(){
  const user=sessionUser();
  if(!user?.userId) return NextResponse.json({error:"Unauthorized"},{status:401});
  return NextResponse.json({iceServers:FREE_STUN_SERVERS,turn:false,mode:"stun-only"},{headers:{"Cache-Control":"no-store"}});
}
