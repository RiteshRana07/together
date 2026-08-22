import { NextResponse } from "next/server";
import { cookies } from "next/headers";
const { verifyToken } = require("../../../../lib/auth");
const { listRoomHistoryForUser } = require("../../../../lib/db");
function user(){ const token=cookies().get("wt_session")?.value; return token&&verifyToken(token); }
export async function GET(){ const p=user(); if(!p)return NextResponse.json({error:"Not signed in"},{status:401}); return NextResponse.json({history:await listRoomHistoryForUser(p.userId)}); }
