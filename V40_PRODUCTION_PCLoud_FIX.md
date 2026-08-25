# WatchTogether v40 – Production pCloud playback fix

This release starts from v34, which is known to play the saved pCloud video on localhost.
The production fix is intentionally narrow:

- Do not send `/api/storage/stream` as the HTML5 video source for pCloud files.
- Ask `/api/storage/playback-url` for a fresh pCloud playback URL when a source is selected.
- Never cache generated pCloud content URLs in Node process memory. Railway can restart or use multiple instances and pCloud content URLs are temporary.
- Select an H.264 + AAC/MP3 variant when pCloud provides transcoded variants.
- On a media error, request a fresh playback URL once instead of leaving the player stuck on a stale URL.
- Keep the actual video bytes off Railway; the browser streams directly from pCloud.

Railway variables remain the same:

```env
PCLOUD_ACCESS_TOKEN=...
PCLOUD_API_HOST=https://api.pcloud.com
PCLOUD_UPLOAD_LINK_CODE=...
PCLOUD_PLAYBACK_MAX_HEIGHT=720
```

After deployment, hard refresh the browser (`Ctrl+Shift+R`). In DevTools → Network, a pCloud room video should show the direct `*.pcloud.com` media request after the WatchTogether `/api/storage/playback-url` request. The `/api/storage/stream` route is retained for compatibility but is no longer used by the room player for pCloud playback.
