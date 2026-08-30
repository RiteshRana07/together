# Email verification fix — v46

## Problem
The verification email previously linked to `/verify-email?token=...`, but that client page only displayed “Check your inbox”; it did not consume the token. The database verification API existed, but the email link never invoked it.

## Fix
Verification emails now link directly to:

`/api/auth/verify-email?token=...`

The API validates the hashed token, checks the 30-minute expiry, marks the user verified, clears the token, creates a session, and redirects to `/dashboard?verified=1`.

The `/verify-email?token=...` page also redirects to the same API endpoint, so old/manual links continue to work.

Signup and resend routes pass the current request origin into the email helper. This prevents a stale `APP_URL` from producing links for the wrong deployment.

No new environment variable is required. Existing `BREVO_API_KEY` and `BREVO_FROM_EMAIL` remain required in production.
