import { NextResponse } from "next/server";
import { cookies } from "next/headers";
const { getRoomByCode, isActiveRoomMember } = require("../../../../../lib/db");
const { verifyToken } = require("../../../../../lib/auth");
const { isPCloudRef } = require("../../../../../lib/pcloud");
function user(){const token=cookies().get("wt_session")?.value;return token&&verifyToken(token);}
async function playable(value, code){return isPCloudRef(value)?`/api/storage/stream?room=${encodeURIComponent(code)}&v=${encodeURIComponent(value)}`:value||"";}
export async function GET(req,{params}){
 const u=user(); if(!u)return NextResponse.json({error:"Not signed in"},{status:401});
 const code=params.code.toUpperCase(); const room=await getRoomByCode(code);
 if(!room)return NextResponse.json({error:"Room not found"},{status:404});
 if(room.host_id!==u.userId && !(await isActiveRoomMember(code,u.userId)))return NextResponse.json({error:"Not an active room member"},{status:403});
 const current=room.current_video_url||room.video_url||"";
 return NextResponse.json({room:{id:room.id,current_video_url:room.current_video_url,current_video_title:room.current_video_title,current_video_source:room.current_video_source,video_url:room.video_url,video_title:room.video_title,video_source:room.video_source,playback_time:room.playback_time,playback_playing:room.playback_playing,playback_updated_at:room.playback_updated_at,playable_current_video_url:await playable(current,code)}});
}
