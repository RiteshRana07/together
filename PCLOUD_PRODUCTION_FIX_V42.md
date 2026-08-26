# WatchTogether v42 — production pCloud playback fix

The library and room player now use the same-origin `/api/storage/stream` endpoint for pCloud videos. The browser never receives a temporary pCloud content URL. The server generates a fresh H.264/AAC-or-MP3 `getvideolinks` URL, sends pCloud's required referrer/origin server-side, and forwards HTTP Range/206 responses. This avoids the 410 errors seen when Chrome requested pCloud content directly from the Railway origin.
