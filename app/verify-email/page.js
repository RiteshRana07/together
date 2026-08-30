"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function VerifyContent() {
  const q = useSearchParams();
  const router = useRouter();
  const [state, setState] = useState("loading");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    let cancelled = false;
    const token = q.get("token");
    const emailParam = q.get("email") || "";
    setEmail(emailParam);

    if (!token) {
      setState("missing");
      return;
    }

    (async () => {
      try {
        const res = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}&json=1`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (!res.ok) {
          setState("error");
          setError(data.error || "This verification link is invalid or has expired.");
          return;
        }

        setState("success");
        setMessage("Your email has been verified. Redirecting you to WatchTogether…");
        setTimeout(() => {
          if (!cancelled) router.replace("/dashboard?verified=1");
        }, 900);
      } catch {
        if (!cancelled) {
          setState("error");
          setError("Unable to verify your email. Please try again.");
        }
      }
    })();

    return () => { cancelled = true; };
  }, [q, router]);

  async function resend() {
    if (!email) return;
    setState("loading");
    setError("");
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        setError(data.error || "Unable to send verification email.");
        return;
      }
      setState("waiting");
      setMessage("Verification email sent. Check your inbox.");
    } catch {
      setState("error");
      setError("Unable to send verification email.");
    }
  }

  const loading = state === "loading";
  const success = state === "success";

  return (
    <main className="wt-page grid place-items-center px-6">
      <section className="wt-card p-8 max-w-md w-full text-center">
        <div className="brand-mark mx-auto">V</div>
        <p className="eyebrow mt-7">EMAIL VERIFICATION</p>
        <h1 className="font-display text-4xl mt-2">
          {loading ? "Verifying your email…" : success ? "Email verified." : state === "waiting" ? "Check your inbox." : "Verification issue."}
        </h1>
        <p className="text-sm text-white/40 leading-6 mt-4">
          {loading
            ? "Please wait while we activate your WatchTogether account."
            : success
              ? message
              : state === "waiting"
                ? <>We sent a new verification link to <span className="text-white/70">{email || "your email address"}</span>.</>
                : error || "The verification link is missing or invalid."}
        </p>
        {error && <p className="settings-error text-left mt-4">{error}</p>}
        {!loading && !success && email && (
          <button onClick={resend} className="wt-button wt-button-primary w-full mt-5">
            Resend verification email
          </button>
        )}
        {!success && (
          <Link href="/login" className="block text-xs text-white/40 hover:text-white mt-5">
            Back to sign in
          </Link>
        )}
      </section>
    </main>
  );
}

export default function VerifyEmailPage() {
  return <Suspense fallback={null}><VerifyContent /></Suspense>;
}
