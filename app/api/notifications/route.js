import { NextResponse } from "next/server";
import { cookies } from "next/headers";
const { verifyToken } = require("../../../lib/auth");
const { listNotifications, getUnreadNotificationCount } = require("../../../lib/db");
function user(){ const token=cookies().get("wt_session")?.value; return token&&verifyToken(token); }
export async function GET(){ const p=user(); if(!p)return NextResponse.json({error:"Not signed in"},{status:401}); return NextResponse.json({notifications:await listNotifications(p.userId),unread:await getUnreadNotificationCount(p.userId)}); }
