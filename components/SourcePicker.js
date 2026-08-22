"use client";
import { useState } from "react";

const tabs = [
  { id: "url", label: "Web video", icon: "↗" },
  { id: "youtube", label: "YouTube", icon: "▶" },
  { id: "drive", label: "Google Drive", icon: "▣" },
];

export default function SourcePicker({ open, onClose, onSubmit, busy = false, title = "Add a video" }) {
  const [tab, setTab] = useState("url");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  if (!open) return null;

  function submit(e) {
    e.preventDefault();
    const url = value.trim();
    if (!url) return setError("Paste a video link first.");
    setError("");
    onSubmit?.(url, tab);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="wt-modal w-full max-w-xl rounded-3xl overflow-hidden">
        <div className="p-6 border-b border-white/10 flex items-start justify-between">
          <div>
            <p className="eyebrow">MEDIA SOURCES</p>
            <h2 className="font-display text-3xl mt-1">{title}</h2>
            <p className="text-sm text-white/50 mt-2">Bring a library video or a playable web source into the room.</p>
          </div>
          <button onClick={onClose} className="icon-button" aria-label="Close">×</button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-5">
          <div className="grid grid-cols-3 gap-2 p-1 rounded-2xl bg-white/[0.04] border border-white/10">
            {tabs.map((item) => (
              <button type="button" key={item.id} onClick={() => { setTab(item.id); setError(""); }} className={`source-tab ${tab === item.id ? "source-tab-active" : ""}`}>
                <span>{item.icon}</span>{item.label}
              </button>
            ))}
          </div>

          <div>
            <label className="text-xs uppercase tracking-[0.18em] text-white/45">Video link</label>
            <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} className="wt-input mt-2" placeholder={tab === "youtube" ? "https://www.youtube.com/watch?v=..." : tab === "drive" ? "https://drive.google.com/file/d/.../view" : "https://example.com/video.mp4"} />
            <p className="text-xs text-white/35 mt-2">
              {tab === "drive" ? "The Drive file must be shared with access to view/download the video." : tab === "youtube" ? "YouTube uses its official embedded player and stays synchronized with the host." : "Direct MP4/WebM/HLS links and sites that expose a browser-playable media URL are supported."}
            </p>
          </div>

          {error && <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="wt-button wt-button-ghost">Cancel</button>
            <button disabled={busy} className="wt-button wt-button-primary">{busy ? "Adding…" : "Add to room"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
