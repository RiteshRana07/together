const APP_URL = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

async function sendVerificationEmail({ email, username, token }) {
  const verifyUrl = `${APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "WatchTogether <onboarding@resend.dev>";

  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") return { sent: false, devUrl: verifyUrl };
    throw new Error("Email service is not configured. Set RESEND_API_KEY and EMAIL_FROM.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Verify your WatchTogether email",
      html: `<!doctype html><html><body style="margin:0;background:#090808;color:#f7f4ef;font-family:Arial,sans-serif;padding:40px"><div style="max-width:560px;margin:auto;background:#151211;border:1px solid #302522;border-radius:20px;padding:32px"><div style="font-size:12px;letter-spacing:3px;color:#d8b36b;font-weight:700">WATCHTOGETHER</div><h1 style="font-family:Georgia,serif;font-weight:400;font-size:34px;margin:18px 0 10px">Verify your email.</h1><p style="color:#b7aaa5;line-height:1.7">Hi ${escapeHtml(username)}, confirm your email address to activate your WatchTogether account and start private watch parties.</p><a href="${verifyUrl}" style="display:inline-block;background:#d95b55;color:white;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700;margin:14px 0">Verify email</a><p style="color:#776d69;font-size:12px;line-height:1.6">This verification link expires in 30 minutes. If you did not create this account, you can ignore this email.</p></div></body></html>`,
    }),
  });
  if (!response.ok) throw new Error(`Email provider error: ${await response.text()}`);
  return { sent: true };
}

async function sendPasswordResetEmail({ email, username, token }) {
  const resetUrl = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "WatchTogether <onboarding@resend.dev>";

  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") return { sent: false, devUrl: resetUrl };
    throw new Error("Email service is not configured. Set RESEND_API_KEY and EMAIL_FROM.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Reset your WatchTogether password",
      html: `<!doctype html><html><body style="margin:0;background:#090808;color:#f7f4ef;font-family:Arial,sans-serif;padding:40px"><div style="max-width:560px;margin:auto;background:#151211;border:1px solid #302522;border-radius:20px;padding:32px"><div style="font-size:12px;letter-spacing:3px;color:#d8b36b;font-weight:700">WATCHTOGETHER</div><h1 style="font-family:Georgia,serif;font-weight:400;font-size:34px;margin:18px 0 10px">Reset your password.</h1><p style="color:#b7aaa5;line-height:1.7">Hi ${escapeHtml(username)}, we received a request to reset the password for your WatchTogether account.</p><a href="${resetUrl}" style="display:inline-block;background:#d95b55;color:white;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700;margin:14px 0">Reset password</a><p style="color:#776d69;font-size:12px;line-height:1.6">This link expires in 30 minutes. If you did not request a password reset, you can safely ignore this email.</p></div></body></html>`,
    }),
  });
  if (!response.ok) throw new Error(`Email provider error: ${await response.text()}`);
  return { sent: true };
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, APP_URL };
