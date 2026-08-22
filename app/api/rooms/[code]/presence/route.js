import { NextResponse } from "next/server";
import { cookies } from "next/headers";
const { verifyToken } = require("../../../../../lib/auth");
const { touchRoomMember, releaseRoomMember, getActiveRoomMembers, reserveRoomSeat } = require("../../../../../lib/db");
const pusher = require("../../../../../lib/pusher");
function getUser(){const token=cookies().get("wt_session")?.value;return token&&verifyToken(token);}
export async function GET(req,{params}){const code=params.code.toUpperCase();try{const members=await getActiveRoomMembers(code);return NextResponse.json({count:members.length,members});}catch(error){console.error("[room presence]",error);try{const result=await pusher.get({path:`/channels/presence-room-${code}`,params:{info:"user_count"}});const data=await result.json();return NextResponse.json({count:data.user_count||0,members:[]});}catch{return NextResponse.json({count:0,members:[]});}}}
export async function POST(req,{params}){const user=getUser();if(!user)return NextResponse.json({error:"Not signed in"},{status:401});const body=await req.json().catch(()=>({}));const code=params.code.toUpperCase();if(body.action==="join"){const result=await reserveRoomSeat(code,user.userId);if(!result.ok){return NextResponse.json({ok:false,error:result.reason==="full"?"This room is full":"Room not found"},{status:result.reason==="full"?403:404});}return NextResponse.json({ok:true,alreadyMember:!!result.alreadyMember});}if(body.action==="leave")await releaseRoomMember(code,user.userId);else await touchRoomMember(code,user.userId);return NextResponse.json({ok:true});}
