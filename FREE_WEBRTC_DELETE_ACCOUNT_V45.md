# WatchTogether v45 — 100% Free WebRTC + Delete Account

## WebRTC
- Removed Cloudflare TURN dependency and credential generation.
- `/api/webrtc/ice` returns public Google STUN servers only.
- No paid relay is used.
- Call remains a peer-to-peer WebRTC mesh using the existing database signaling.
- Because this is STUN-only, a call may fail on networks that block direct WebRTC/NAT traversal. No STUN-only solution can guarantee connectivity on every network.

## Delete account
- Deletes the user's room signals and chat messages before deleting the user, preventing foreign-key failures.
- Hosted rooms are archived and removed as before.
- User queue entries are removed.
- References from other rooms to the user's library movies are detached before movie deletion.
- pCloud cleanup remains best-effort; an unavailable pCloud object no longer prevents the WatchTogether account from being deleted.
