# Cross-device pCloud playback

Watch Together uses a pCloud public link for browser playback instead of passing a private `getfilelink` URL from one browser/user to another.

Flow:

1. The server verifies the pCloud file reference.
2. It reuses an existing public link for that file, or creates one once.
3. It calls `getpubvideolinks` server-side and selects an H.264/AAC (or H.264/MP3) variant when available.
4. If pCloud has no video variant yet, it falls back to `getpublinkdownload`.
5. The resulting content URL is sent to the browser. It contains no WatchTogether session token or pCloud API token.
6. When the WatchTogether movie is deleted, its public link is removed before the pCloud file is deleted.

pCloud requires the account email to be verified before a public link can be created. If it is not verified, the application reports a clear error instead of returning a broken video URL.
