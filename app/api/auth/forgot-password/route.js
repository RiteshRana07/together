import { NextResponse } from "next/server";
const { getUserByEmail, setPasswordResetToken } = require("../../../../lib/db");
const { createVerificationToken, hashVerificationToken } = require("../../../../lib/auth");
const { sendPasswordResetEmail } = require("../../../../lib/email");

export async function POST(req) {
  try {
    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

    const user = await getUserByEmail(email);
    // Do not reveal whether an account exists.
    if (!user) return NextResponse.json({ message: "If an account exists for this email, a reset link has been sent." });

    const token = createVerificationToken();
    await setPasswordResetToken(user.id, hashVerificationToken(token), Date.now() + 30 * 60 * 1000);
    const mail = await sendPasswordResetEmail({ email: user.email, username: user.username, token });

    return NextResponse.json({
      message: "If an account exists for this email, a reset link has been sent.",
      devResetUrl: mail.devUrl || undefined,
    });
  } catch (error) {
    console.error("[forgot-password]", error);
    return NextResponse.json({ error: "Unable to process the password reset request" }, { status: 500 });
  }
}
