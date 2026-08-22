import { NextResponse } from "next/server";
import { cookies } from "next/headers";
const { verifyToken } = require("../../../../lib/auth");
const { markNotificationRead } = require("../../../../lib/db");
function user(){ const token=cookies().get("wt_session")?.value; return token&&verifyToken(token); }
export async function POST(req){ const p=user(); if(!p)return NextResponse.json({error:"Not signed in"},{status:401}); const {id}=await req.json().catch(()=>({})); if(!id)return NextResponse.json({error:"Notification id required"},{status:400}); const item=await markNotificationRead(p.userId,id); return NextResponse.json({notification:item}); }
