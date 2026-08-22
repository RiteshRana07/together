import { NextResponse } from "next/server";
const { resetPasswordByTokenHash } = require("../../../../lib/db");
const { hashVerificationToken, hashPassword } = require("../../../../lib/auth");

export async function POST(req) {
  try {
    const { token, password } = await req.json();
    if (!token || !password) return NextResponse.json({ error: "Reset token and new password are required" }, { status: 400 });
    if (String(password).length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    const user = await resetPasswordByTokenHash(hashVerificationToken(String(token)), await hashPassword(String(password)));
    if (!user) return NextResponse.json({ error: "This reset link is invalid or has expired. Please request a new one." }, { status: 400 });
    return NextResponse.json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("[reset-password]", error);
    return NextResponse.json({ error: "Unable to reset password" }, { status: 500 });
  }
}
