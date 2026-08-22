# WatchTogether v22 realtime/room startup fix

- Room membership is established in PostgreSQL before Pusher is attempted, so the room no longer blocks on “Preparing the room…”.
- Pusher subscription errors no longer deny the room; database sync remains active.
- Active participants are read from PostgreSQL with stable user IDs.
- Viewer playback follows persisted playback state without remounting the player.
- Chat writes directly to PostgreSQL and polls for delivery; Pusher is optional for fan-out.
- WebRTC signaling uses a PostgreSQL polling fallback through `room_signals`.
- Queue/original-video changes remain persisted even when Pusher fan-out is unavailable.
