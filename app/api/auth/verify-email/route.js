import { NextResponse } from "next/server";
const { verifyUserByTokenHash } = require("../../../../lib/db");
const { hashVerificationToken, signToken, sessionCookie } = require("../../../../lib/auth");

export async function GET(req) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.redirect(new URL("/login?verified=invalid", req.url));
  const user = await verifyUserByTokenHash(hashVerificationToken(token));
  if (!user) return NextResponse.redirect(new URL("/login?verified=expired", req.url));
  const response = NextResponse.redirect(new URL("/dashboard?verified=1", req.url));
  response.headers.set("Set-Cookie", sessionCookie(signToken({ userId: user.id, username: user.username })));
  return response;
}
