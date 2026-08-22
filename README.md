# WatchTogether

A Next.js watch-party application with authentication, PostgreSQL persistence, Pusher realtime sync, YouTube/direct video support, room capacity controls, and a multi-video queue.

## Storage

This version uses **pCloud S3-compatible object storage** instead of pCloud.

See `PCLOUD_SETUP.md` for:

- pCloud bucket setup
- Access keys
- Vercel environment variables
- CORS configuration
- Upload limits and multipart behavior

### Upload behavior

- `< 100 MB`: direct pre-signed PUT with browser progress.
- `100 MB–3 GB`: 16 MB multipart parts, up to 3 concurrent uploads, retrying failed parts.
- The browser never receives the pCloud secret key.
- PostgreSQL stores a stable `pcloud:<file-id>` reference.
- Private bucket playback uses fresh pre-signed GET URLs.

## Database

Set `DATABASE_URL` to a PostgreSQL database. The app creates/migrates its tables on first use.

## Realtime

Set the Pusher variables in `.env.local`/Vercel environment variables.

## Local development

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

Only upload or share content you own or have permission to share.

## v6 pCloud temporary-folder cleanup

v6 keeps the working v4 pCloud File Request upload flow and does not introduce the authenticated `createuploadlink` flow from v5. After an upload is finalized, the video is moved into the logged-in user's permanent pCloud folder and an empty temporary folder named like `Files from <user> on <date>` is removed. Non-empty or unrelated folders are never deleted.

## Email verification & account settings
New accounts require email verification. Configure `APP_URL`, `RESEND_API_KEY`, and `EMAIL_FROM` to send real verification emails. Without a Resend key in local development, the verification URL is shown on the verification screen for testing.

Account settings are available from the profile avatar and include profile/avatar, verified email status, password change, notifications, and playback preferences.

## Forgot password

WatchTogether now includes a secure password-recovery flow:
- Login -> Forgot password
- Reset email sent through Resend
- Reset token stored as a SHA-256 hash
- Reset token expires after 30 minutes
- Passwords are bcrypt-hashed
- Reset tokens are single-use
- Development mode exposes a reset URL when `RESEND_API_KEY` is not configured
- Unknown emails return the same generic response to reduce account enumeration

Required email configuration remains:
```env
APP_URL=http://localhost:3000
RESEND_API_KEY=
EMAIL_FROM=WatchTogether <onboarding@resend.dev>
```


## v22 realtime and room startup fix
The room establishes PostgreSQL membership before Pusher subscription, so it no longer remains stuck on “Preparing the room…” when realtime configuration is unavailable. Playback, participants, chat and call signaling have database-backed fallbacks. See `REALTIME_FIX_V22.md`.

## v30 playback improvements

Room playback no longer proxies pCloud video bytes through the Next.js/Railway server. The room resolves a short-lived public pCloud playback URL and the browser streams directly from pCloud, while keeping the pCloud storage reference private in the database. A 720p-or-lower H.264/AAC variant is preferred by default for smoother cross-device playback; change `PCLOUD_PLAYBACK_MAX_HEIGHT` if needed.

Viewer playback also handles browser autoplay restrictions: it attempts to start automatically, falls back to muted playback when permitted, and shows a one-click **Join playback & enable sound** control when the browser requires a user gesture.

Synchronization uses drift correction instead of repeatedly seeking for small timing differences, reducing visible stutter for viewers.
