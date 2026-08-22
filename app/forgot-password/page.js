"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function ForgotForm() {
  const q = useSearchParams();
  const [email, setEmail] = useState(q.get("email") || "");
  const [message, setMessage] = useState("");
  const [devUrl, setDevUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true); setError(""); setMessage(""); setDevUrl("");
    const res = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) return setError(data.error || "Unable to send reset email");
    setMessage(data.message || "If an account exists for this email, a reset link has been sent.");
    if (data.devResetUrl) setDevUrl(data.devResetUrl);
  }

  return <main className="wt-page grid place-items-center px-6"><section className="wt-card p-8 max-w-md w-full"><div className="brand-mark mx-auto">V</div><p className="eyebrow mt-7 text-center">ACCOUNT RECOVERY</p><h1 className="font-display text-4xl mt-2 text-center">Forgot your password?</h1><p className="text-sm text-white/40 leading-6 mt-4 text-center">Enter the email connected to your WatchTogether account and we’ll send you a secure reset link.</p><form onSubmit={submit} className="space-y-4 mt-7"><label className="settings-label">Email address<input className="wt-input mt-2" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email"/></label>{message&&<p className="settings-success">{message}</p>}{error&&<p className="settings-error">{error}</p>}{devUrl&&<a href={devUrl} className="block text-xs text-red-300 underline break-all">Open development reset link →</a>}<button disabled={loading} className="wt-button wt-button-primary w-full">{loading?"Sending…":"Send reset link"}</button></form><Link href="/login" className="block text-xs text-white/40 hover:text-white mt-5 text-center">Back to sign in</Link></section></main>;
}
export default function ForgotPasswordPage(){return <Suspense fallback={null}><ForgotForm/></Suspense>}
