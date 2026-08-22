const { extractYouTubeId } = require('./youtube');

function extractDriveId(input) {
  const value = String(input || '').trim();
  if (!value) return null;
  const patterns = [
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i,
    /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/i,
    /drive\.google\.com\/uc\?(?:[^#]*&)?id=([a-zA-Z0-9_-]+)/i,
    /[?&]id=([a-zA-Z0-9_-]+)/i,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function driveDownloadUrl(id) {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
}

function sourceFromUrl(input) {
  const url = String(input || '').trim();
  const youtubeId = extractYouTubeId(url);
  if (youtubeId) return { videoUrl: youtubeId, videoSource: 'youtube', videoTitle: null };

  const driveId = extractDriveId(url);
  if (driveId) return { videoUrl: driveDownloadUrl(driveId), videoSource: 'drive', videoTitle: null, videoRef: driveId };

  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return { videoUrl: url, videoSource: 'url', videoTitle: null };
  } catch {
    return null;
  }
}

async function resolveMediaInput(input) {
  const resolved = sourceFromUrl(input);
  if (!resolved) return null;
  if (resolved.videoSource === 'youtube') {
    try {
      const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${resolved.videoUrl}`)}&format=json`);
      if (response.ok) resolved.videoTitle = (await response.json()).title || null;
    } catch {}
  }
  return resolved;
}

module.exports = { extractDriveId, driveDownloadUrl, sourceFromUrl, resolveMediaInput };
