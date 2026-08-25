# v35 — Original pCloud streaming fix

## Root cause
The room stream endpoint was using pCloud's authenticated `getfilelink` URL. That URL is not the same as the public video playback URL used by cross-device room playback and could leave the HTML5 video element stuck at the loading/buffering state after redirect.

## Fix
`/api/storage/stream` now uses `getPublicVideoLink(fileId)`, which:
- reuses/creates the room-safe public pCloud link;
- asks pCloud for playable H.264/AAC variants when available;
- falls back to the public download URL when video variants are unavailable;
- returns a direct 302 so Railway does not proxy video bytes.

## Player UX
The HTML5 player now clears stale buffering state on media errors and shows a Retry stream button instead of remaining indefinitely on the buffering overlay.
