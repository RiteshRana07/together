# Queue switch fix v14

The queue/original switch now uses a separate canonical playback state on the room page.
The database keeps the pCloud reference; the player receives a same-origin stream URL.

The HTML5 video element is reused instead of being remounted. During a source switch,
`onPause`, `onPlaying`, and `onSeeked` are guarded so the source change cannot emit a
spurious room `pause` action. The host's queue selection therefore changes the current
media immediately without requiring a leave/rejoin cycle.

A 1.5 second room-state recovery poll is used only to recover from a missed Pusher
`room:video-changed` event. It compares the canonical pCloud reference and does not
reload the player when the reference is unchanged.
