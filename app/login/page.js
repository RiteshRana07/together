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
        <span>NOW SHOWING</span>
        <i />
        <b>TIME</b><i /><b>LIVE CHAT, REACTIONS, AND IN-ROOM CALLS</b><i /><b>ONE ROOM</b>
      </div>
    </section>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/dashboard";
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [verificationNotice, setVerificationNotice] = useState("");

  async function handleSubmit(e) {
    e.preventDefault(); setError(""); setVerificationNotice(""); setLoading(true);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json(); setLoading(false);
      if (!res.ok) {
        if (data.verificationRequired) return setVerificationNotice(`Please verify ${data.email || form.email} before signing in.`);
        return setError(data.error || "Something went wrong");
      }
      router.push(redirect);
    } catch { setLoading(false); setError("Unable to connect. Please try again."); }
  }

  return (
    <main className="auth-page">
      <AuthVisual />
      <section className="auth-form-panel">
        <div className="auth-form-inner">
          <div className="auth-eyebrow">MEMBERS' ENTRANCE</div>
          <h2 className="auth-title">Welcome back to your seat.</h2>
          <p className="auth-description">Sign in and the room is just as you left it — your library, your people, and the film nobody finished.</p>

          <form onSubmit={handleSubmit} className="auth-form">
            <label className="auth-label">Email address</label>
            <input type="email" className="auth-input" placeholder="you@example.com" value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})} required autoComplete="email" />

            <div className="auth-label-row"><label className="auth-label">Password</label><Link href={`/forgot-password?email=${encodeURIComponent(form.email)}`} className="auth-inline-link">Forgot password?</Link></div>
            <div className="auth-password-wrap">
              <input type={showPassword ? "text" : "password"} className="auth-input" placeholder="Enter your password" value={form.password} onChange={(e)=>setForm({...form,password:e.target.value})} required autoComplete="current-password" />
              <button type="button" className="auth-eye" onClick={()=>setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "◉" : "◌"}</button>
            </div>

            {error && <div className="auth-error">{error}</div>}
            {verificationNotice && <div className="auth-warning">{verificationNotice}<button type="button" className="auth-resend" onClick={async()=>{const r=await fetch("/api/auth/resend-verification",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:form.email})});const d=await r.json();setVerificationNotice(d.devVerificationUrl?`Development verification link: ${d.devVerificationUrl}`:(d.message||d.error));}}>Resend verification</button></div>}

            <button disabled={loading} className="auth-primary">{loading ? "Signing in…" : "Sign in"}</button>
          </form>

          <div className="auth-divider"><span>New to WatchTogether?</span></div>
          <Link href={`/signup?redirect=${encodeURIComponent(redirect)}`} className="auth-secondary">Create an account</Link>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() { return <Suspense fallback={null}><LoginForm /></Suspense>; }
