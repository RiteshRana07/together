"use client";
import { useEffect, useRef, useState } from "react";

const HARD_SEEK_TOLERANCE = 3.5;
const SOFT_DRIFT_TOLERANCE = 0.7;
const REMOTE_GUARD_MS = 1000;
let apiLoadPromise;

function loadYouTubeAPI() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (apiLoadPromise) return apiLoadPromise;
  apiLoadPromise = new Promise((resolve) => {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(tag);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(); };
  });
  return apiLoadPromise;
}

function normalizeVideoId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || "";
    if (["youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) {
      if (u.pathname === "/watch") return u.searchParams.get("v") || "";
      if (u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2] || "";
      if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] || "";
      if (u.pathname.startsWith("/live/")) return u.pathname.split("/")[2] || "";
    }
  } catch {}
  return raw;
}

export default function YouTubePlayer({ videoId, channel, broadcast, canControl, initialSync, autoplayOnSourceChange = false }) {
  const containerRef = useRef(null), playerRef = useRef(null), ready = useRef(false);
  const remoteGuardUntil = useRef(0), lastState = useRef(null), initialSyncRef = useRef(initialSync || null);
  const firstVideoRef = useRef(true), rateTimer = useRef(null), canControlRef = useRef(canControl);
  const [reactions, setReactions] = useState([]), [needsPlay, setNeedsPlay] = useState(false);
  const normalizedVideoId = normalizeVideoId(videoId);

  useEffect(() => { canControlRef.current = canControl; }, [canControl]);
  useEffect(() => { initialSyncRef.current = initialSync || null; }, [initialSync]);
  function markRemote() { remoteGuardUntil.current = Date.now() + REMOTE_GUARD_MS; }
  function restoreRate() { if (rateTimer.current) clearTimeout(rateTimer.current); try { playerRef.current?.setPlaybackRate?.(1); } catch {} }
  function gentlyCorrect(target) {
    const p = playerRef.current; if (!p || !ready.current) return;
    try {
      const drift = target - p.getCurrentTime();
      if (Math.abs(drift) >= HARD_SEEK_TOLERANCE) { p.seekTo(Math.max(0, target), true); restoreRate(); return; }
      if (Math.abs(drift) > SOFT_DRIFT_TOLERANCE && p.getPlayerState() === window.YT.PlayerState.PLAYING) {
        p.setPlaybackRate(drift > 0 ? 1.05 : 0.95);
        if (rateTimer.current) clearTimeout(rateTimer.current);
        rateTimer.current = setTimeout(restoreRate, 1200);
      } else restoreRate();
    } catch {}
  }
  function playWithGesture() {
    const p = playerRef.current; if (!p || !ready.current) return;
    try { p.unMute(); p.setVolume(100); p.playVideo(); setNeedsPlay(false); } catch { setNeedsPlay(true); }
  }
  function attemptPlay() {
    const p = playerRef.current; if (!p || !ready.current) return;
    try {
      p.unMute(); p.setVolume(100); p.playVideo();
      setTimeout(() => {
        try {
          if (p.getPlayerState() !== window.YT.PlayerState.PLAYING) {
            if (canControlRef.current) {
              // Never silently mute the host. Let the explicit Resume button
              // provide the browser user gesture required for audible playback.
              p.unMute(); p.setVolume(100); setNeedsPlay(true);
            } else {
              p.mute(); p.setVolume(100); p.playVideo(); setNeedsPlay(true);
            }
          }
        } catch {}
      }, 500);
    } catch {
      if (canControlRef.current) {
        try { p.unMute(); p.setVolume(100); } catch {}
      } else {
        try { p.mute(); p.playVideo(); } catch {}
      }
      setNeedsPlay(true);
    }
  }

  useEffect(() => {
    if (canControl) return;
    const p = playerRef.current, s = initialSync;
    if (!p || !ready.current || !s || !Number.isFinite(Number(s.time))) return;
    markRemote();
    let target = Math.max(0, Number(s.time));
    if (s.playing && Number(s.updatedAt) > 0) target += Math.max(0, (Date.now() - Number(s.updatedAt)) / 1000);
    gentlyCorrect(target);
    if (s.playing) attemptPlay();
    else { try { p.pauseVideo(); } catch {} restoreRate(); }
  }, [initialSync, canControl]);

  useEffect(() => {
    let destroyed = false;
    loadYouTubeAPI().then(() => {
      if (destroyed || !containerRef.current || playerRef.current) return;
      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId: normalizedVideoId,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3, controls: canControlRef.current ? 1 : 0, disablekb: canControlRef.current ? 0 : 1, origin: window.location.origin },
        events: {
          onReady: () => {
            ready.current = true;
            const sync = initialSyncRef.current;
            if (sync && Number.isFinite(Number(sync.time))) {
              let target = Math.max(0, Number(sync.time));
              if (sync.playing && Number(sync.updatedAt) > 0) target += Math.max(0, (Date.now() - Number(sync.updatedAt)) / 1000);
              try { playerRef.current.seekTo(target, true); } catch {}
              lastState.current = sync.playing ? "playing" : "paused";
              if (sync.playing) attemptPlay(); else { try { playerRef.current.pauseVideo(); } catch {} }
            } else broadcast?.("player:request-sync", {});
          },
          onError: (e) => console.warn("[YouTubePlayer] YouTube error", e.data, normalizedVideoId),
          onStateChange: (e) => {
            if (!ready.current || !broadcast || !canControlRef.current || Date.now() < remoteGuardUntil.current) return;
            const p = playerRef.current; if (!p) return;
            if (e.data === window.YT.PlayerState.PLAYING) {
              setNeedsPlay(false);
              if (lastState.current !== "playing") broadcast("player:action", { action: "play", time: p.getCurrentTime(), updatedAt: Date.now() });
              lastState.current = "playing";
            } else if (e.data === window.YT.PlayerState.PAUSED) {
              if (lastState.current !== "paused") broadcast("player:action", { action: "pause", time: p.getCurrentTime(), updatedAt: Date.now() });
              lastState.current = "paused";
            }
          },
        },
      });
    });
    return () => { destroyed = true; try { playerRef.current?.destroy?.(); } catch {} playerRef.current = null; ready.current = false; restoreRate(); };
    // Player iframe is mounted once; source changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const p = playerRef.current, id = normalizeVideoId(videoId);
    if (!p || !ready.current || !id || typeof p.loadVideoById !== "function") return;
    markRemote(); lastState.current = null; setNeedsPlay(false);
    const first = firstVideoRef.current; firstVideoRef.current = false;
    try {
      if (autoplayOnSourceChange || first) p.loadVideoById({ videoId: id, startSeconds: 0 });
      else p.cueVideoById({ videoId: id, startSeconds: 0 });
    } catch { try { p.loadVideoById(id); } catch {} }
    if (autoplayOnSourceChange) setTimeout(attemptPlay, 150);
  }, [normalizedVideoId, autoplayOnSourceChange]);

  useEffect(() => {
    if (!channel) return;
    function applySync({ time, playing, updatedAt }) {
      const p = playerRef.current; if (!p || !ready.current || !Number.isFinite(Number(time))) return;
      markRemote(); let target = Number(time);
      if (playing && Number(updatedAt) > 0) target += Math.max(0, (Date.now() - Number(updatedAt)) / 1000);
      gentlyCorrect(target); lastState.current = playing ? "playing" : "paused";
      if (playing && p.getPlayerState() !== window.YT.PlayerState.PLAYING) attemptPlay();
      if (!playing && p.getPlayerState() === window.YT.PlayerState.PLAYING) { p.pauseVideo(); restoreRate(); }
    }
    function onAction({ action, time, playing, updatedAt }) {
      const p = playerRef.current; if (!p || !ready.current) return;
      markRemote(); let target = Number(time);
      if (Number.isFinite(target)) { if (playing && Number(updatedAt) > 0) target += Math.max(0, (Date.now() - Number(updatedAt)) / 1000); gentlyCorrect(target); }
      if (action === "play") { if (canControlRef.current) setNeedsPlay(false); attemptPlay(); }
      if (action === "pause") { p.pauseVideo(); restoreRate(); }
    }
    function onRequestSync() {
      const p = playerRef.current;
      if (!p || !ready.current || !canControlRef.current || !broadcast) return;
      broadcast("player:heartbeat", { time: p.getCurrentTime(), playing: lastState.current === "playing", updatedAt: Date.now() });
    }
    function onReaction({ emoji }) { const id = Math.random().toString(36).slice(2); setReactions(r => [...r, { id, emoji, left: 10 + Math.random() * 80 }]); setTimeout(() => setReactions(r => r.filter(x => x.id !== id)), 2000); }
    channel.bind("player:action", onAction); channel.bind("player:heartbeat", applySync); channel.bind("player:request-sync", onRequestSync); channel.bind("reaction:show", onReaction);
    if (ready.current) broadcast?.("player:request-sync", {});
    return () => { channel.unbind("player:action", onAction); channel.unbind("player:heartbeat", applySync); channel.unbind("player:request-sync", onRequestSync); channel.unbind("reaction:show", onReaction); };
  }, [channel, broadcast, videoId]);

  useEffect(() => {
    if (!broadcast || !canControl) return;
    const i = setInterval(() => { const p = playerRef.current; if (!p || !ready.current || Date.now() < remoteGuardUntil.current) return; broadcast("player:heartbeat", { time: p.getCurrentTime(), playing: lastState.current === "playing", updatedAt: Date.now() }); }, 2500);
    return () => clearInterval(i);
  }, [broadcast, canControl]);

  return <div className="relative rounded-xl overflow-hidden bg-black aspect-video shadow-2xl shadow-black/50">
    <div ref={containerRef} className="w-full h-full" />
    {!canControl && <div className="absolute top-3 right-3 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur text-xs text-neutral-300 pointer-events-none">🔒 Host controls playback</div>}
    {needsPlay && <button onClick={playWithGesture} className="absolute inset-0 m-auto w-fit h-fit rounded-full bg-[#d95b55] text-white px-6 py-3 text-sm font-semibold shadow-2xl hover:scale-[1.02] transition">▶ {canControl ? "Resume YouTube" : "Join playback & enable sound"}</button>}
    {reactions.map(r => <span key={r.id} className="absolute bottom-10 text-3xl animate-bounce pointer-events-none" style={{left:`${r.left}%`}}>{r.emoji}</span>)}
  </div>;
}
