import { NextResponse } from "next/server";
import { cookies } from "next/headers";
const { getUserById, getUserByEmail, getUserByUsername, updateUserProfileSafe } = require("../../../../lib/db");
const { verifyToken, createVerificationToken, hashVerificationToken } = require("../../../../lib/auth");
const { sendVerificationEmail } = require("../../../../lib/email");

async function currentUser() {
  const token = cookies().get("wt_session")?.value;
  const payload = token && verifyToken(token);
  return payload ? getUserById(payload.userId) : null;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ user });
}

export async function PUT(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const username = String(body.username || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const settings = body.settings && typeof body.settings === "object" ? body.settings : user.settings || {};
  if (!username || !email) return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  if (email !== user.email.toLowerCase()) {
    const duplicate = await getUserByEmail(email);
    if (duplicate && duplicate.id !== user.id) return NextResponse.json({ error: "That email is already in use" }, { status: 409 });
  }
  if (username !== user.username) {
    const duplicateName = await getUserByUsername(username);
    if (duplicateName && duplicateName.id !== user.id) return NextResponse.json({ error: "That username is already in use" }, { status: 409 });
  }

  const emailChanged = email !== user.email.toLowerCase();
  const verificationToken = emailChanged ? createVerificationToken() : null;
  const updated = await updateUserProfileSafe(user.id, {
    username,
    email,
    settings,
    verificationTokenHash: verificationToken ? hashVerificationToken(verificationToken) : null,
    verificationExpiresAt: verificationToken ? Date.now() + 30 * 60 * 1000 : null,
  });

  let emailSent = false;
  let devVerificationUrl;
  if (emailChanged) {
    const mail = await sendVerificationEmail({ email, username, token: verificationToken });
    emailSent = mail.sent;
    devVerificationUrl = mail.devUrl;
  }
  return NextResponse.json({ user: updated, emailChanged, emailSent, devVerificationUrl });
}
