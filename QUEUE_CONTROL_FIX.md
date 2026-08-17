# Queue and Host Playback Control Fix

This version changes room playback rules:

- The original room video remains stored as the immutable original video.
- Adding a queue item does not replace the original video.
- Each queued item has its own **Play** button for the host.
- The host can return to the original video with **Play original**.
- Non-host viewers can add videos to the queue, but cannot play, pause, seek, or control playback.
- This restriction is enforced both in the UI and server-side in `/api/rooms/[code]/broadcast`.
- Queue playback endpoints reject non-host users.
- HTML5 video controls are hidden for non-host viewers.
- YouTube controls and keyboard input are disabled for non-host viewers.
