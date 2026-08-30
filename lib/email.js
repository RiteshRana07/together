const APP_URL = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

function getBrevoConfig() {
  const apiKey = String(process.env.BREVO_API_KEY || "").trim();
  const fromEmail = String(process.env.BREVO_FROM_EMAIL || "").trim();
  const fromName = String(process.env.BREVO_FROM_NAME || "WatchTogether").trim() || "WatchTogether";

  if (!apiKey || !fromEmail) {
    return null;
  }

  return { apiKey, fromEmail, fromName };
}

async function sendBrevoEmail({ to, toName, subject, htmlContent, textContent, tag }) {
  const config = getBrevoConfig();

  if (!config) {
    throw new Error(
      "Brevo email service is not configured. Set BREVO_API_KEY and BREVO_FROM_EMAIL."
    );
  }

  const response = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": config.apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        name: config.fromName,
        email: config.fromEmail,
      },
      to: [
        {
          email: to,
          ...(toName ? { name: toName } : {}),
        },
      ],
      subject,
      htmlContent,
      textContent,
      ...(tag ? { tags: [tag] } : {}),
    }),
  });

  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const detail = data?.message || data?.code || raw || `HTTP ${response.status}`;
    throw new Error(`Brevo API error (${response.status}): ${detail}`);
  }

  return {
    sent: true,
    messageId: data?.messageId || null,
  };
}

async function sendVerificationEmail({ email, username, token, appUrl }) {
  const baseUrl = String(appUrl || APP_URL).replace(/\/$/, "");
  // Verification links go directly through the server endpoint so clicking the
  // email actually consumes the token. The UI page is still available for
  // users who open /verify-email manually.
  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;

  const safeUsername = escapeHtml(username);
  const safeVerifyUrl = escapeHtml(verifyUrl);

  const htmlContent = `<!doctype html>
<html>
  <body style="margin:0;background:#090808;color:#f7f4ef;font-family:Arial,sans-serif;padding:40px">
    <div style="max-width:560px;margin:auto;background:#151211;border:1px solid #302522;border-radius:20px;padding:32px">
      <div style="font-size:12px;letter-spacing:3px;color:#d8b36b;font-weight:700">WATCHTOGETHER</div>
      <h1 style="font-family:Georgia,serif;font-weight:400;font-size:34px;margin:18px 0 10px">Verify your email.</h1>
      <p style="color:#b7aaa5;line-height:1.7">Hi ${safeUsername}, confirm your email address to activate your WatchTogether account and start private watch parties.</p>
      <a href="${safeVerifyUrl}" style="display:inline-block;background:#d95b55;color:white;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700;margin:14px 0">Verify email</a>
      <p style="color:#776d69;font-size:12px;line-height:1.6">This verification link expires in 30 minutes. If you did not create this account, you can ignore this email.</p>
    </div>
  </body>
</html>`;

  const textContent = `WatchTogether\n\nHi ${username || "there"},\n\nVerify your email to activate your WatchTogether account:\n${verifyUrl}\n\nThis verification link expires in 30 minutes. If you did not create this account, you can ignore this email.`;

  try {
    return await sendBrevoEmail({
      to: email,
      toName: username,
      subject: "Verify your WatchTogether email",
      htmlContent,
      textContent,
      tag: "watchtogether-email-verification",
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production" && !getBrevoConfig()) {
      return { sent: false, devUrl: verifyUrl };
    }
    throw error;
  }
}

async function sendPasswordResetEmail({ email, username, token }) {
  const resetUrl = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;

  const safeUsername = escapeHtml(username);
  const safeResetUrl = escapeHtml(resetUrl);

  const htmlContent = `<!doctype html>
<html>
  <body style="margin:0;background:#090808;color:#f7f4ef;font-family:Arial,sans-serif;padding:40px">
    <div style="max-width:560px;margin:auto;background:#151211;border:1px solid #302522;border-radius:20px;padding:32px">
      <div style="font-size:12px;letter-spacing:3px;color:#d8b36b;font-weight:700">WATCHTOGETHER</div>
      <h1 style="font-family:Georgia,serif;font-weight:400;font-size:34px;margin:18px 0 10px">Reset your password.</h1>
      <p style="color:#b7aaa5;line-height:1.7">Hi ${safeUsername}, we received a request to reset the password for your WatchTogether account.</p>
      <a href="${safeResetUrl}" style="display:inline-block;background:#d95b55;color:white;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700;margin:14px 0">Reset password</a>
      <p style="color:#776d69;font-size:12px;line-height:1.6">This link expires in 30 minutes. If you did not request a password reset, you can safely ignore this email.</p>
    </div>
  </body>
</html>`;

  const textContent = `WatchTogether\n\nHi ${username || "there"},\n\nReset your WatchTogether password using this link:\n${resetUrl}\n\nThis link expires in 30 minutes. If you did not request a password reset, you can safely ignore this email.`;

  try {
    return await sendBrevoEmail({
      to: email,
      toName: username,
      subject: "Reset your WatchTogether password",
      htmlContent,
      textContent,
      tag: "watchtogether-password-reset",
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production" && !getBrevoConfig()) {
      return { sent: false, devUrl: resetUrl };
    }
    throw error;
  }
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  }[char]));
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  APP_URL,
};
