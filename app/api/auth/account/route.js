import { NextResponse } from "next/server";
import { cookies } from "next/headers";
const { verifyToken, verifyPassword, clearCookie } = require("../../../../lib/auth");
const { getUserAuthById, listMoviesForUser, deleteUserAccount } = require("../../../../lib/db");
const { deleteStoredObject } = require("../../../../lib/pcloud");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request) {
  const token = cookies().get("wt_session")?.value;
  const payload = token ? verifyToken(token) : null;
  if (!payload?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const currentPassword = String(body?.currentPassword || "");
    const confirmation = String(body?.confirmation || "").trim().toUpperCase();
    if (confirmation !== "DELETE MY ACCOUNT") {
      return NextResponse.json({ error: "Type DELETE MY ACCOUNT to confirm account deletion." }, { status: 400 });
    }

    const user = await getUserAuthById(payload.userId);
    if (!user || !(await verifyPassword(currentPassword, user.password_hash))) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }

    // Delete owned pCloud videos before removing their database rows.
    const movies = await listMoviesForUser(payload.userId);
    const storageFailures = [];
    for (const movie of movies) {
      try {
        await deleteStoredObject(movie.video_url);
      } catch (error) {
        console.error("[account delete] pCloud file delete failed", movie.id, error);
        storageFailures.push(movie.title || movie.id);
      }
    }

    if (storageFailures.length) {
      return NextResponse.json(
        { error: "Some library videos could not be removed from storage. Your account was not deleted. Try again after the storage connection is available." },
        { status: 502 }
      );
    }

    await deleteUserAccount(payload.userId);

    const response = NextResponse.json({ ok: true });
    response.headers.set("Set-Cookie", clearCookie());
    return response;
  } catch (error) {
    console.error("[account delete]", error);
    return NextResponse.json({ error: error?.message || "Could not delete your account." }, { status: 500 });
  }
}
