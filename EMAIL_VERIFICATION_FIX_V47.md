# WatchTogether v47 — Email Verification Production/Localhost Fix

## What was wrong
Verification emails could be generated with a backend/API origin such as `http://localhost:8080`. Clicking the email therefore opened a port where the web UI was not running and Chrome showed `ERR_CONNECTION_REFUSED`.

## Fix
- Verification emails now point to the web UI route `/verify-email?token=...`.
- `NEXT_PUBLIC_APP_URL` is preferred, then `APP_URL`.
- In the common local split-port setup, `localhost:8080` is normalized to the Next.js UI at `localhost:3000`.
- `/verify-email` consumes the token through `/api/auth/verify-email?token=...&json=1` and sets the login cookie before redirecting to `/dashboard?verified=1`.
- Direct API verification remains supported for compatibility.
- Resend verification uses the same public UI origin logic.
