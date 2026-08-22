import { NextResponse } from "next/server";
import { cookies } from "next/headers";
const { getUserAuthById, updateUserPassword } = require("../../../../lib/db");
const { verifyToken, verifyPassword, hashPassword } = require("../../../../lib/auth");

export async function PUT(req) {
  const token = cookies().get("wt_session")?.value;
  const payload = token && verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await getUserAuthById(payload.userId);
  const { currentPassword, newPassword } = await req.json();
  if (!user || !(await verifyPassword(currentPassword || "", user.password_hash))) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  if (!newPassword || newPassword.length < 8) return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
  await updateUserPassword(user.id, await hashPassword(newPassword));
  return NextResponse.json({ message: "Password updated" });
}
