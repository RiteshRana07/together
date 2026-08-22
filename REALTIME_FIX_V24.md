# Realtime / Performance Fix V24

- Removed 1-second full-room polling.
- Added lightweight 4-second `/api/rooms/[code]/sync` fallback.
- Removed React `key` remounts from video players; source changes are handled in-place.
- Chat no longer calls `scrollIntoView()` on the page; it scrolls only its own message pane when already near the bottom.
- Initial auth + room fetch now runs in parallel.
- Pusher remains the primary realtime path for playback/source changes.
