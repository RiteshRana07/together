"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function AuthVisual() {
  return (
    <section className="auth-visual">
      <div className="auth-brand"><span className="auth-brand-mark">W</span><span>WatchTogether</span></div>
      <div className="auth-copy">
        <h1>Your cinema. Your<br />people. One moment.</h1>
        <p>Watch together in real time — play, pause, and seek,<br className="desktop-only" /> and the whole room follows.</p>
      </div>
      <div className="auth-ticker">
        <span>NOW SHOWING</span><i /><b>PRIVATE ROOMS</b><i /><b>LIVE CHAT, REACTIONS, AND IN-ROOM CALLS</b><i /><b>ONE ROOM</b>
      </div>
    </section>
  );
}

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/dashboard";
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [rights, setRights] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault(); setError("");
    if (!rights) return setError("Please accept the content rights agreement to continue.");
    if (form.password.length < 8) return setError("Password must contain at least 8 characters.");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json(); setLoading(false);
      if (!res.ok) return setError(data.error || "Something went wrong");
      router.push(`/verify-email?email=${encodeURIComponent(form.email)}${data.devVerificationUrl ? `&dev=1&link=${encodeURIComponent(data.devVerificationUrl)}` : ""}`);
    } catch { setLoading(false); setError("Unable to connect. Please try again."); }
  }

  return (
    <main className="auth-page auth-page-signup">
      <AuthVisual />
      <section className="auth-form-panel auth-form-panel-scroll">
        <div className="auth-form-inner auth-signup-inner">
          <div className="auth-eyebrow">YOUR PRIVATE SCREENING ROOM</div>
          <h2 className="auth-title">Set up your account.</h2>
          <p className="auth-description">Set up your account, bring a film or paste a YouTube link, and open a private room just for your people.</p>

          <form onSubmit={handleSubmit} className="auth-form">
            <label className="auth-label">Full name</label>
            <input className="auth-input" placeholder="Enter your full name" value={form.username} onChange={(e)=>setForm({...form,username:e.target.value})} required autoComplete="name" />

            <label className="auth-label">Email address</label>
            <input type="email" className="auth-input" placeholder="you@example.com" value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})} required autoComplete="email" />

            <label className="auth-label">Password</label>
            <div className="auth-password-wrap">
              <input type={showPassword ? "text" : "password"} className="auth-input" placeholder="Create a strong password" value={form.password} onChange={(e)=>setForm({...form,password:e.target.value})} required minLength={8} autoComplete="new-password" />
              <button type="button" className="auth-eye" onClick={()=>setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "◉" : "◌"}</button>
            </div>
            <div className="auth-helper">Use at least eight characters.</div>

            <label className="rights-check">
              <input type="checkbox" checked={rights} onChange={(e)=>setRights(e.target.checked)} />
              <span className="rights-box" />
              <span><strong>Content rights agreement</strong><small>I will only upload videos that I own or have permission to store and privately share.</small></span>
            </label>

            {error && <div className="auth-error">{error}</div>}
            <button disabled={loading} className="auth-primary">{loading ? "Creating account…" : "Create account"}</button>
          </form>

          <div className="auth-divider"><span>Already registered?</span></div>
          <Link href={`/login?redirect=${encodeURIComponent(redirect)}`} className="auth-secondary">Sign in instead</Link>
        </div>
      </section>
    </main>
  );
}

export default function SignupPage() { return <Suspense fallback={null}><SignupForm /></Suspense>; }
