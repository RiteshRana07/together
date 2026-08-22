import { NextResponse } from "next/server";
const { createUser, getUserByEmail } = require("../../../../lib/db");
const { hashPassword, createVerificationToken, hashVerificationToken } = require("../../../../lib/auth");
const { sendVerificationEmail } = require("../../../../lib/email");

export async function POST(req) {
  try {
    const { username, email, password } = await req.json();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const cleanUsername = String(username || "").trim();
    if (!cleanUsername || !normalizedEmail || !password) return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    if (password.length < 6) return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    if (await getUserByEmail(normalizedEmail)) return NextResponse.json({ error: "Email already registered" }, { status: 409 });

    const token = createVerificationToken();
    const user = await createUser({
      username: cleanUsername,
      email: normalizedEmail,
      passwordHash: await hashPassword(password),
      verificationTokenHash: hashVerificationToken(token),
      verificationExpiresAt: Date.now() + 30 * 60 * 1000,
    });
    const mail = await sendVerificationEmail({ email: normalizedEmail, username: cleanUsername, token });

    return NextResponse.json({ user, verificationRequired: true, emailSent: mail.sent, devVerificationUrl: mail.devUrl || undefined });
  } catch (error) {
    console.error("[signup]", error);
    return NextResponse.json({ error: error.message || "Unable to create account" }, { status: 500 });
  }
}
