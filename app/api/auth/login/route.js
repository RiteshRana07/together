import { NextResponse } from "next/server";
const { getUserByEmail } = require("../../../../lib/db");
const { verifyPassword, signToken, sessionCookie } = require("../../../../lib/auth");

export async function POST(req) {
  const { email, password } = await req.json();
  const user = await getUserByEmail(email);

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  if (!user.email_verified) {
    return NextResponse.json({ error: "Please verify your email before signing in.", verificationRequired: true, email: user.email }, { status: 403 });
  }

  const token = signToken({ userId: user.id, username: user.username });
  const res = NextResponse.json({
    user: { id: user.id, username: user.username, email: user.email },
  });
  res.headers.set("Set-Cookie", sessionCookie(token));
  return res;
}
