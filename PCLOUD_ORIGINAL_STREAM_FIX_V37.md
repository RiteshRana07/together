# v37 — Original pCloud playback fix

The previous room player used a Next.js redirect to pCloud `getfilelink`. The browser could report a media load error even though pCloud had a valid file link.

v37 changes the playback path:

1. The room authenticates the member server-side.
2. `/api/storage/playback-url` calls pCloud `getvideolinks` server-side.
3. It selects an H.264/AAC compatible MP4 variant at or below the configured playback height when available.
4. The short-lived pCloud content URL is returned as JSON.
5. The browser assigns that direct pCloud URL to the HTML5 `<video>` element; Railway does not proxy the movie bytes.
6. If pCloud has no compatible transcoded variant, v37 falls back to `getfilelink`.

This uses pCloud's documented `getvideolinks` API, which returns playable variants with codec, resolution, host and path information.
