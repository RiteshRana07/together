# WatchTogether v25 — Notifications + Room History

## Added
- `/notifications` activity page matching the supplied reference: last 24 hours, earlier, unread dot, mark read, mark all read.
- `/rooms/history` room history page matching the supplied reference empty state and completed-party cards.
- Notification badge in the top navigation.
- Notification persistence in PostgreSQL.
- Room history snapshots preserve participants and chat when a host ends/deletes a room.
- Watch-party-started notification when a room is created.
- Room-joined notification for the host when another participant joins.
- Watch-party-ended notification for participants when the host ends the room.
- Expandable history details showing who was there and the saved chat.

## Database
The lazy schema migration adds:
- `notifications`
- `room_history`

No separate migration command is required; `lib/db.js` creates the tables on first database access.
