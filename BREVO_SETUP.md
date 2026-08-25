# WatchTogether Brevo Email Setup

This version uses the Brevo HTTPS transactional-email API for email verification and forgot-password emails. It does not use SMTP.

## Railway variables

Set these on the WatchTogether Railway service:

```env
APP_URL=https://YOUR-RAILWAY-DOMAIN
BREVO_API_KEY=xkeysib-...
BREVO_FROM_EMAIL=your-verified-sender@example.com
BREVO_FROM_NAME=WatchTogether
```

`BREVO_API_KEY` must stay server-side. Do not prefix it with `NEXT_PUBLIC_` and do not commit it to Git.

## Brevo setup

1. Verify the Brevo account/phone if Brevo requests it.
2. Open **Settings -> SMTP & API -> API Keys & MCP**.
3. Generate an API key and copy it immediately.
4. Register and verify a sender under Brevo's sender settings.
5. Put that sender email into `BREVO_FROM_EMAIL`.
6. Redeploy Railway after saving the variables.

The application sends to `https://api.brevo.com/v3/smtp/email` using the `api-key` header. This is Brevo's transactional email API and does not require an SMTP connection.

## Emails covered

- New-account email verification
- Resend verification email
- Forgot-password reset email

## Local development

If Brevo variables are missing in development, the auth routes still return a development verification/reset URL. In production, missing Brevo configuration is treated as an error so email failures are not silently hidden.
