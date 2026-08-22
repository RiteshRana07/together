"use client";
import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

function ResetForm() {
  const q = useSearchParams();
  const router = useRouter();
  const token = q.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!token) return setError("This reset link is missing a valid token.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setLoading(true);
    const res = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) return setError(data.error || "Unable to reset password");
    setSuccess(true);
    setTimeout(() => router.push("/login"), 1800);
  }

  return <main className="wt-page grid place-items-center px-6"><section className="wt-card p-8 max-w-md w-full"><div className="brand-mark mx-auto">V</div><p className="eyebrow mt-7 text-center">ACCOUNT SECURITY</p><h1 className="font-display text-4xl mt-2 text-center">Create a new password.</h1>{success ? <><p className="settings-success mt-5">Your password has been reset successfully. Redirecting you to sign in…</p><Link href="/login" className="wt-button wt-button-primary w-full mt-5 text-center block">Continue to sign in</Link></> : <form onSubmit={submit} className="space-y-4 mt-7"><label className="settings-label">New password<input className="wt-input mt-2" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters" required minLength={8}/></label><label className="settings-label">Confirm new password<input className="wt-input mt-2" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Repeat your password" required minLength={8}/></label>{error&&<p className="settings-error">{error}</p>}<button disabled={loading||!token} className="wt-button wt-button-primary w-full">{loading?"Resetting…":"Reset password"}</button><p className="text-xs text-white/35 text-center">Reset links expire after 30 minutes.</p></form>}<Link href="/login" className="block text-xs text-white/40 hover:text-white mt-5 text-center">Back to sign in</Link></section></main>;
}
export default function ResetPasswordPage(){return <Suspense fallback={null}><ResetForm/></Suspense>}
