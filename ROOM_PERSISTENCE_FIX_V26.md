# WatchTogether v26 — Persistent Watch Rooms + Explicit Leave

## Behavior
- A room appears in a user's Watch Rooms after they join it.
- Leaving a room removes only active presence; the room remains in Watch Rooms.
- Navigating to Home, Library, Notifications, Settings, etc. does not call the leave endpoint.
- The room can be re-entered later.
- Chat messages remain in `room_messages` and are not deleted when a participant leaves.
- A viewer's Remove action hides that room from that viewer's Watch Rooms only.
- The host's Delete action ends the room for everyone and creates the existing history snapshot.
- Re-entering a room clears a previous viewer-level Remove state and restores it to Watch Rooms.

## Data model
`room_members` remains transient presence/capacity state.
`room_access` is persistent user-to-room access state with `removed_at` for the viewer's Remove action.
