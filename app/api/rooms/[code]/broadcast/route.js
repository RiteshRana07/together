import { NextResponse } from "next/server";
import { cookies } from "next/headers";
const pusher = require("../../../../../lib/pusher");
const { verifyToken } = require("../../../../../lib/auth");
const { getRoomByCode, isActiveRoomMember, createRoomMessage, updateRoomPlaybackState } = require("../../../../../lib/db");
const ALLOWED_EVENTS=["player:action","player:heartbeat","player:request-sync","chat:message","reaction:show","call:signal"];
const HOST_ONLY_EVENTS=["player:action","player:heartbeat"];
const EXCLUDE_SENDER_EVENTS=["player:action","player:heartbeat"];
export async function POST(req,{params}){
 try{
  const code=params.code.toUpperCase(); const body=await req.json(); const {event,data={},socketId}=body||{};
  if(!ALLOWED_EVENTS.includes(event)) return NextResponse.json({error:"Invalid event"},{status:400});
  const token=cookies().get("wt_session")?.value; const payload=token&&verifyToken(token);
  if(!payload) return NextResponse.json({error:"Not signed in"},{status:401});
  const room=await getRoomByCode(code); if(!room) return NextResponse.json({error:"Room not found"},{status:404});
  const isHost=payload.userId===room.host_id;
  if(HOST_ONLY_EVENTS.includes(event)&&!isHost) return NextResponse.json({error:"Only the host can control playback"},{status:403});
  if(!HOST_ONLY_EVENTS.includes(event)&&event!=="player:request-sync"&&!isHost){const active=await isActiveRoomMember(code,payload.userId);if(!active)return NextResponse.json({error:"You are not an active room member"},{status:403});}
  let safePayload=data&&typeof data==="object"?{...data}:{};
  if(event==="chat:message"){
   const saved=await createRoomMessage(code,payload.userId,payload.username,safePayload.message,safePayload.clientId);
   if(!saved)return NextResponse.json({error:"Message is empty"},{status:400});
   safePayload={message:saved.message,username:saved.username,userId:saved.user_id,clientId:saved.client_id,messageId:saved.id,at:saved.created_at};
  }
  if(event==="player:action"||event==="player:heartbeat"){
   const time=Number(safePayload.time);
   const playing=event==="player:action"?(safePayload.action==="play"?true:safePayload.action==="pause"?false:!!safePayload.playing):!!safePayload.playing;
   await updateRoomPlaybackState(code,payload.userId,{time,playing});
   safePayload={...safePayload,time:Number.isFinite(time)&&time>=0?time:0,playing};
  }
  const options=EXCLUDE_SENDER_EVENTS.includes(event)&&socketId?{socket_id:socketId}:undefined;
  try{await pusher.trigger(`presence-room-${code}`,event,safePayload,options);}catch(error){console.warn("[room broadcast] realtime publish unavailable",error?.message||error)}
  return NextResponse.json({ok:true,data:safePayload});
 }catch(error){console.error("[room broadcast]",error);return NextResponse.json({error:"Realtime event failed"},{status:500});}
}
