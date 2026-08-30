# v44 — Video Call + Delete Account Fix

## Video calls

The call client now obtains short-lived ICE/TURN credentials from `/api/webrtc/ice`.
Set these Railway variables:

- `CLOUDFLARE_TURN_KEY_ID`
- `CLOUDFLARE_TURN_API_TOKEN`

The API token stays server-side. The backend calls Cloudflare's credential-generation endpoint and returns only short-lived `iceServers` to the browser.

Cloudflare's current TURN documentation recommends generating expiring credentials server-side and passing the resulting `iceServers` to `RTCPeerConnection`.

## Delete account

Account deletion no longer gets permanently blocked by a pCloud cleanup error. Missing pCloud files are treated as already deleted; other storage failures are reported as a cleanup warning after the WatchTogether database account is removed.

The user still must provide the current password and type `DELETE MY ACCOUNT`.
