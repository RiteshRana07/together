"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Nav from "../../../components/Nav";
import VideoPlayer from "../../../components/VideoPlayer";
import YouTubePlayer from "../../../components/YouTubePlayer";
import Chat from "../../../components/Chat";
import Queue from "../../../components/Queue";
import { getPusherClient } from "../../../lib/pusher-client";

const PRESETS = [1, 2, 3, 5, 10];

export default function RoomPage({ params }) {
  const code = params.code.toUpperCase();
  const router = useRouter();
  const [user, setUser] = useState(undefined);
  const [room, setRoom] = useState(undefined);
  const [channel, setChannel] = useState(null);
  const [socketId, setSocketId] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [copied, setCopied] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [joinState, setJoinState] = useState("checking");
  const [connectReady, setConnectReady] = useState(false);
  const [capacityInput, setCapacityInput] = useState("");
  const [autoplayCurrentVideo, setAutoplayCurrentVideo] = useState(false);
  // Keep playback URL separate from the canonical DB room state. The DB stores
  // pCloud refs; the player uses a same-origin stream URL. Mixing those two
  // values was the main cause of queue switches getting stuck until rejoin.
  const [playback, setPlayback] = useState({ url: "", title: "", source: "", ref: "", version: 0 });

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.user) {
          router.push(`/login?redirect=${encodeURIComponent(`/room/${code}`)}`);
          return;
        }
        setUser(d.user);
      })
      .catch(() => setJoinError("Couldn't verify your account."));
  }, [router, code]);

  const toPlayableRoomState = useCallback((r) => {
    if (!r) return { url: "", title: "", source: "", ref: "" };
    const ref = r.current_video_url || r.video_url || "";
    const url = r.playable_current_video_url || r.playable_video_url || ref;
    return {
      url,
      title: r.current_video_title || r.video_title || "",
      source: r.current_video_source || r.video_source || "",
      ref,
    };
  }, []);

  useEffect(() => {
    fetch(`/api/rooms/${code}`)
      .then((r) => r.json())
      .then((d) => {
        const nextRoom = d.room || null;
        setRoom(nextRoom);
        if (nextRoom) {
          const p = toPlayableRoomState(nextRoom);
          setPlayback((prev) => ({ ...p, version: prev.version + 1 }));
        }
      })
      .catch(() => setRoom(null));
  }, [code, toPlayableRoomState]);

  const isHost = !!(user && room && user.id === room.host_id);

  useEffect(() => {
    if (room) setCapacityInput(String(room.max_participants || ""));
  }, [room?.max_participants]);

  // Check capacity before showing the video. The Pusher auth route performs
  // the final atomic seat reservation, so simultaneous joins cannot overfill.
  useEffect(() => {
    if (!user || !room) return;
    let cancelled = false;
    setJoinState("checking");
    setConnectReady(false);
    fetch(`/api/rooms/${code}/can-join`, { cache: "no-store" })
      .then(async (res) => ({ res, data: await res.json() }))
      .then(({ res, data }) => {
        if (cancelled) return;
        if (!res.ok || !data.allowed) {
          setJoinError(data.error || "This room is full.");
          setJoinState("denied");
          setConnectReady(false);
        } else {
          setJoinError("");
          setJoinState("connecting");
          setConnectReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setJoinError("Couldn't check room capacity. Please refresh.");
          setJoinState("denied");
          setConnectReady(false);
        }
      });
    return () => { cancelled = true; };
  }, [user?.id, room?.id, code]);

  useEffect(() => {
    if (!user || !room || !connectReady) return;
    const pusher = getPusherClient();
    const onConnected = () => setSocketId(pusher.connection.socket_id);
    pusher.connection.bind("connected", onConnected);
    if (pusher.connection.state === "connected") onConnected();

    const channelName = `presence-room-${code}`;
    const ch = pusher.subscribe(channelName);

    ch.bind("pusher:subscription_succeeded", (members) => {
      const list = [];
      members.each((m) => list.push({ id: m.id, username: m.info.username, isHost: !!m.info.isHost }));
      setParticipants(list);
      setJoinState("joined");
      setJoinError("");
    });
    ch.bind("pusher:member_added", (member) => {
      setParticipants((p) => p.some((x) => x.id === member.id) ? p : [...p, { id: member.id, username: member.info.username, isHost: !!member.info.isHost }]);
    });
    ch.bind("pusher:member_removed", (member) => {
      setParticipants((p) => p.filter((x) => x.id !== member.id));
    });
    ch.bind("pusher:subscription_error", (status) => {
      console.error("Pusher subscription error:", status);
      setJoinState("denied");
      setJoinError(status?.status === 403 || status === 403 ? "This room is full." : "Couldn't connect to the room's live sync. Try refreshing.");
    });

    ch.bind("room:video-changed", ({ videoUrl, videoTitle, videoSource, videoRef, autoplay }) => {
      // Do NOT put the playable /api/storage/stream URL into the room DB-shaped
      // state. Keep the canonical pCloud ref separately. This prevents a later
      // queue/original switch from being compared against the wrong value.
      setAutoplayCurrentVideo(!!autoplay);
      setPlayback((prev) => ({
        url: videoUrl || prev.url,
        title: videoTitle || prev.title,
        source: videoSource || prev.source,
        ref: videoRef || prev.ref,
        version: prev.version + 1,
      }));
    });

    ch.bind("room:capacity-changed", ({ maxParticipants }) => {
      setRoom((prev) => prev ? { ...prev, max_participants: maxParticipants } : prev);
    });

    setChannel(ch);
    return () => {
      fetch(`/api/rooms/${code}/presence`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "leave" }), keepalive: true }).catch(() => {});
      pusher.unsubscribe(channelName);
      pusher.connection.unbind("connected", onConnected);
      setChannel(null);
    };
  }, [user?.id, room?.id, code, connectReady]);

  // Refresh the DB seat reservation while the tab is open.
  useEffect(() => {
    if (joinState !== "joined") return;
    const heartbeat = setInterval(() => {
      fetch(`/api/rooms/${code}/presence`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "heartbeat" }) }).catch(() => {});
    }, 12_000);
    return () => clearInterval(heartbeat);
  }, [joinState, code]);

  const broadcast = useCallback((event, data) => {
    fetch(`/api/rooms/${code}/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, data, socketId }),
    }).catch(() => {});
  }, [code, socketId]);


  const refreshRoomPlayback = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${code}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.room) return;
      setRoom(data.room);
      const p = toPlayableRoomState(data.room);
      setPlayback((prev) => {
        if (prev.ref === p.ref && prev.url === p.url) return prev;
        setAutoplayCurrentVideo(false);
        return { ...p, version: prev.version + 1 };
      });
    } catch (error) {
      console.error("[room] playback state refresh failed:", error);
    }
  }, [code, toPlayableRoomState]);

  // Pusher is the fast path. This short poll is a recovery path for mobile
  // browsers/background tabs where a realtime event can be missed. It compares
  // the canonical pCloud reference, not the generated stream URL.
  useEffect(() => {
    if (joinState !== "joined" || !room) return;
    let cancelled = false;
    const sync = async () => {
      try {
        const res = await fetch(`/api/rooms/${code}`, { cache: "no-store" });
        const data = await res.json();
        if (cancelled || !res.ok || !data.room) return;
        const p = toPlayableRoomState(data.room);
        setRoom(data.room);
        setPlayback((prev) => {
          if (prev.ref === p.ref) return prev;
          setAutoplayCurrentVideo(false);
          return { ...p, version: prev.version + 1 };
        });
      } catch {}
    };
    const timer = setInterval(sync, 1500);
    return () => { cancelled = true; clearInterval(timer); };
  }, [joinState, room?.id, code, toPlayableRoomState]);

  // Apply a host-selected queue/original video locally immediately. Pusher
  // still updates every other participant, but the host must never have to
  // leave/rejoin the room just to see the newly selected source.
  const applyRoomVideo = useCallback(({ videoUrl, videoTitle, videoSource, videoRef, autoplay = false }) => {
    if (!videoUrl) return;
    setAutoplayCurrentVideo(!!autoplay);
    setPlayback((prev) => ({
      url: videoUrl,
      title: videoTitle || prev.title,
      source: videoSource || prev.source,
      ref: videoRef || prev.ref,
      version: prev.version + 1,
    }));
  }, []);

  async function updateCapacity(value) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 500) {
      alert("Room size must be between 1 and 500.");
      return;
    }
    const res = await fetch(`/api/rooms/${code}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maxParticipants: n }) });
    const data = await res.json();
    if (res.ok) setRoom((prev) => ({ ...prev, max_participants: data.room.max_participants }));
    else alert(data.error || "Couldn't update room size");
  }

  async function addToQueue(videoUrl) {
    const res = await fetch(`/api/rooms/${code}/queue`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ videoUrl }) });
    const data = await res.json();
    if (!res.ok) alert(data.error || "Couldn't add video to queue");
  }

  function copyInviteLink() {
    navigator.clipboard.writeText(`${window.location.origin}/invite/${code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (user === undefined || room === undefined) return null;
  if (room === null) {
    return <main><Nav username={user?.username} /><div className="max-w-lg mx-auto px-6 py-24 text-center"><h1 className="text-xl font-semibold mb-2">Room not found</h1><p className="text-neutral-500 text-sm mb-6">Double-check the room code and try again.</p><Link href="/rooms" className="text-accent text-sm hover:underline">← Back to rooms</Link></div></main>;
  }

  const myCanControl = isHost;
  const currentVideoUrl = playback.url || room.playable_current_video_url || room.playable_video_url || room.current_video_url || room.video_url;
  const currentVideoTitle = playback.title || room.current_video_title || room.video_title;
  const currentVideoSource = playback.source || room.current_video_source || room.video_source;

  return (
    <main>
      <Nav username={user.username} />
      <div className="max-w-6xl mx-auto px-6 py-8">
        <Link href="/rooms" className="text-sm text-neutral-500 hover:text-white">← Back to rooms</Link>
        <div className="flex items-center justify-between mb-6 mt-4">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              {room.name}
              {isHost && <span className="text-[10px] uppercase tracking-wide bg-accent/20 text-accent px-2 py-0.5 rounded-full">Host</span>}
            </h1>
            <p className="text-xs text-neutral-500">Original: {room.original_video_title || room.original_video_url || room.video_title || room.video_url} · Room code: {room.code}</p>
            {currentVideoTitle && currentVideoTitle !== (room.original_video_title || room.video_title) && <p className="text-xs text-accent mt-1">Now playing: {currentVideoTitle}</p>}

            {isHost && (
              <div className="mt-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-neutral-500">Room size:</span>
                  {PRESETS.map((n) => (
                    <button key={n} onClick={() => { setCapacityInput(String(n)); updateCapacity(n); }} className={`px-2.5 py-1 rounded border ${Number(capacityInput) === n ? "border-accent text-accent" : "border-neutral-800 text-neutral-400 hover:text-white"}`}>{n}</button>
                  ))}
                  <button onClick={() => { const n = Math.min(500, Number(room.max_participants || 1) + 1); setCapacityInput(String(n)); updateCapacity(n); }} className="px-2.5 py-1 rounded border border-neutral-800 text-neutral-400 hover:text-white">+1</button>
                  <button onClick={() => { const n = Math.max(1, Number(room.max_participants || 1) - 1); setCapacityInput(String(n)); updateCapacity(n); }} className="px-2.5 py-1 rounded border border-neutral-800 text-neutral-400 hover:text-white">−1</button>
                  <input value={capacityInput} onChange={(e) => setCapacityInput(e.target.value.replace(/\D/g, "").slice(0, 3))} onBlur={() => updateCapacity(capacityInput)} type="text" inputMode="numeric" placeholder="custom" className="w-20 bg-neutral-900 border border-neutral-800 rounded px-2 py-1" />
                  <span className="text-neutral-600">max 500 · no unlimited</span>
                </div>
                <p className="text-[11px] text-neutral-600 mt-1">{participants.length} / {room.max_participants} watching</p>
              </div>
            )}
          </div>
          <button onClick={copyInviteLink} className="text-sm px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700">{copied ? "Link copied!" : "Copy invite link"}</button>
        </div>

        {joinError && <div className="mb-4 p-3 rounded-lg bg-red-950 border border-red-900 text-sm text-red-300">{joinError}</div>}

        {joinState !== "joined" ? (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-10 text-center">
            {joinState === "checking" || joinState === "connecting" ? <><p className="font-medium mb-2">{joinState === "checking" ? "Checking room capacity..." : "Joining room..."}</p><p className="text-sm text-neutral-500">The video and chat will appear after your seat is confirmed.</p></> : <><p className="font-medium mb-2">You can't join this room</p><p className="text-sm text-neutral-500">Ask the host to increase the room size.</p></>}
          </div>
        ) : (
          <>
            <div className="grid lg:grid-cols-[1fr_320px] gap-6">
              {currentVideoSource === "youtube" ? <YouTubePlayer key={`yt-${currentVideoUrl}`} videoId={currentVideoUrl} channel={channel} broadcast={broadcast} canControl={myCanControl} /> : <VideoPlayer videoUrl={currentVideoUrl} channel={channel} broadcast={broadcast} canControl={myCanControl} autoplayOnSourceChange={autoplayCurrentVideo} onPlaybackError={refreshRoomPlayback} />}
              <div className="h-[520px]"><Chat channel={channel} broadcast={broadcast} username={user.username} userId={user.id} participants={participants} isHost={isHost} onAddToQueue={addToQueue} /></div>
            </div>
            <Queue
              code={code}
              channel={channel}
              isHost={isHost}
              currentVideoTitle={currentVideoTitle}
              currentVideoUrl={currentVideoUrl}
              originalVideoTitle={room.original_video_title || room.video_title}
              originalVideoUrl={room.original_video_url || room.video_url}
              onPlayOriginal={async () => {
                const res = await fetch(`/api/rooms/${code}/queue/original`, { method: "POST" });
                const data = await res.json();
                if (!res.ok) {
                  alert(data.error || "Couldn't play the original video");
                  return;
                }
                applyRoomVideo({
                  videoUrl: data.playableVideoUrl,
                  videoTitle: data.room?.original_video_title || data.room?.video_title,
                  videoSource: data.room?.original_video_source || data.room?.video_source,
                  videoRef: data.room?.original_video_url || data.room?.video_url,
                  autoplay: true,
                });
              }}
              onVideoChange={applyRoomVideo}
            />
          </>
        )}
      </div>
    </main>
  );
}
