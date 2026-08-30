import { NextResponse } from "next/server";
const { verifyUserByTokenHash } = require("../../../../lib/db");
const { hashVerificationToken, signToken, sessionCookie } = require("../../../../lib/auth");

export async function GET(req) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) {
    if (new URL(req.url).searchParams.get("json") === "1") {
      return NextResponse.json({ error: "Verification token is missing." }, { status: 400 });
    }
    return NextResponse.redirect(new URL("/login?verified=invalid", req.url));
  }
  const user = await verifyUserByTokenHash(hashVerificationToken(token));
  if (!user) {
    if (new URL(req.url).searchParams.get("json") === "1") {
      return NextResponse.json({ error: "This verification link is invalid or has expired." }, { status: 400 });
    }
    return NextResponse.redirect(new URL("/login?verified=expired", req.url));
  }
  const isJson = new URL(req.url).searchParams.get("json") === "1";
  if (isJson) {
    const response = NextResponse.json({ verified: true, user: { id: user.id, username: user.username, email: user.email } });
    response.headers.set("Set-Cookie", sessionCookie(signToken({ userId: user.id, username: user.username })));
    return response;
  }
  const response = NextResponse.redirect(new URL("/dashboard?verified=1", req.url));
  response.headers.set("Set-Cookie", sessionCookie(signToken({ userId: user.id, username: user.username })));
  return response;
}
