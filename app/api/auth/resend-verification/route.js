import { NextResponse } from "next/server";
import { cookies } from "next/headers";
const { getUserByEmail, setVerificationToken, getUserById } = require("../../../../lib/db");
const { verifyToken, createVerificationToken, hashVerificationToken } = require("../../../../lib/auth");
const { sendVerificationEmail, getPublicAppUrl } = require("../../../../lib/email");

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const session = cookies().get("wt_session")?.value;
  const payload = session && verifyToken(session);
  let user = payload ? await getUserById(payload.userId) : null;
  if (!user && body.email) user = await getUserByEmail(String(body.email).trim().toLowerCase());
  if (!user) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  if (user.email_verified) return NextResponse.json({ message: "Email is already verified" });

  const token = createVerificationToken();
  await setVerificationToken(user.id, hashVerificationToken(token), Date.now() + 30 * 60 * 1000);
  const mail = await sendVerificationEmail({ email: user.email, username: user.username, token, appUrl: getPublicAppUrl(req) });
  return NextResponse.json({ message: "Verification email sent", emailSent: mail.sent, devVerificationUrl: mail.devUrl || undefined });
}
