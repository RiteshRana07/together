"use client";
import { useEffect, useState } from "react";

export default function Queue({ code, channel, isHost, currentVideoTitle, currentVideoUrl, originalVideoTitle, originalVideoUrl, onPlayOriginal, onVideoChange }) {
  const [queue, setQueue] = useState([]);
  const [busyId, setBusyId] = useState(null);

  async function loadQueue() {
    try {
      const res = await fetch(`/api/rooms/${code}/queue`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setQueue(data.queue || []);
    } catch {}
  }

  useEffect(() => {
    loadQueue();
    if (!channel) return;
    const refresh = () => loadQueue();
    channel.bind("room:queue-changed", refresh);
    return () => channel.unbind("room:queue-changed", refresh);
  }, [code, channel]);

  async function playItem(id) {
    if (!isHost) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/rooms/${code}/queue/play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) alert(data.error || "Couldn't play this queued video");
      else {
        await loadQueue();
        if (data.playableVideoUrl || data.room) {
          onVideoChange?.({
            videoUrl: data.playableVideoUrl,
            videoRef: data.videoRef || data.item?.video_url || data.room?.current_video_url || data.room?.video_url,
            videoTitle: data.room?.current_video_title || data.room?.video_title,
            videoSource: data.room?.current_video_source || data.room?.video_source,
            autoplay: true,
          });
        }
      }
    } finally {
      setBusyId(null);
    }
  }

  async function removeItem(id) {
    const res = await fetch(`/api/rooms/${code}/queue?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) loadQueue();
  }

  if (!queue.length && !isHost) return null;

  const originalIsCurrent = (originalVideoUrl && currentVideoUrl && originalVideoUrl === currentVideoUrl) || (originalVideoTitle && currentVideoTitle === originalVideoTitle);

  return (
    <div className="mt-4 rounded-xl bg-neutral-900 border border-neutral-800 p-4">
      <div className="flex items-center justify-between mb-3 gap-3">
        <div>
          <h2 className="text-sm font-semibold">Queue</h2>
          <p className="text-xs text-neutral-500">Queued videos are separate from the original room video. Only the host can start playback.</p>
        </div>
        {isHost && currentVideoTitle && !originalIsCurrent && (
          <button
            onClick={onPlayOriginal}
            className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 font-medium"
          >
            ▶ Play original
          </button>
        )}
      </div>

      {queue.length === 0 ? (
        <p className="text-xs text-neutral-600">No videos queued yet.</p>
      ) : (
        <div className="space-y-2">
          {queue.map((item, index) => (
            <div key={item.id} className="flex items-center gap-3 rounded-lg bg-neutral-950 px-3 py-2">
              <span className="text-xs text-neutral-600 w-4">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">{item.video_title || item.video_url}</p>
                <p className="text-[11px] text-neutral-600">added by {item.added_by_username || "viewer"}</p>
              </div>
              {isHost && (
                <button
                  onClick={() => playItem(item.id)}
                  disabled={busyId === item.id}
                  className="text-xs px-2.5 py-1 rounded-lg bg-accent text-black font-medium disabled:opacity-50"
                >
                  {busyId === item.id ? "Starting..." : "▶ Play"}
                </button>
              )}
              <button
                onClick={() => removeItem(item.id)}
                className="text-xs text-neutral-600 hover:text-red-400"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
