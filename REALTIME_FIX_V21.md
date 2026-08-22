# WatchTogether v21 realtime fixes

## Fixed
- Pusher room subscription no longer immediately unsubscribes when joinState changes from `connecting` to `joined`.
- Local video player is no longer remounted every 2.5 seconds by room hydration.
- Host playback state is persisted in PostgreSQL and replayed to new joiners.
- Play/pause/seek events carry an explicit `playing` state.
- New joiners receive an initial playback position and playing state.
- Room participant list is backed by active PostgreSQL room membership and refreshed every 2 seconds.
- Chat messages are persisted and loaded from PostgreSQL, with Pusher used for realtime delivery.
- WebRTC signaling stays mounted even when the Call tab is hidden.
- WebRTC peers use a stable offerer rule, queued ICE candidates, rollback for offer collisions, and local-stream refs.
- Calls ignore signaling while the local user has not joined the call.
- Optional TURN configuration remains supported for cross-network WebRTC reliability.

## Environment
For calls across different networks, configure:

NEXT_PUBLIC_TURN_URL=
NEXT_PUBLIC_TURN_USERNAME=
NEXT_PUBLIC_TURN_CREDENTIAL=

STUN is included by default, but TURN is recommended for production.
