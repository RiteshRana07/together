# v39 pCloud original-video playback fix

The room stream endpoint now:
- chooses only H.264 + AAC/MP3 pCloud video variants;
- requests `contenttype=video/mp4`;
- preserves Range/206 semantics;
- explicitly sends `Accept-Ranges` and `Content-Length`;
- validates/repairs missing `Content-Range` when possible;
- refreshes expired pCloud links while preserving the original Range request;
- reports unsupported codecs instead of silently selecting HEVC/other formats.

The browser continues to request the same-origin `/api/storage/stream` URL, so pCloud content URLs are never exposed to the room player.
