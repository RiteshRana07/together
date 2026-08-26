# WatchTogether v43 — pCloud production playback fix

The library and room use the same-origin `/api/storage/stream` endpoint. The browser never receives a temporary pCloud content URL.

The stream route:
- authenticates the signed-in user / active room member
- generates a fresh pCloud `getfilelink` URL for every media request
- sends pCloud referrer/origin server-side
- preserves HTTP Range requests
- buffers only ranged chunks so Content-Length matches the actual bytes Chrome receives
- retries expired pCloud links
- falls back once to a pCloud transcoded H.264/AAC/MP3 variant
- never caches temporary pCloud content URLs

Do not use a cached pCloud URL in the database or client.
