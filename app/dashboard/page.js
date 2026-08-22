"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Nav from "../../components/Nav";
import { useCurrentUser } from "../../lib/use-current-user";

function Stat({label,value,caption,icon}){return <div className="cin-stat"><div className="cin-stat-icon">{icon}</div><div><p className="cin-eyebrow">{label}</p><p className="cin-stat-value">{value}</p><p className="cin-muted cin-small">{caption}</p></div></div>}
function Step({n,title,body}){return <div className="cin-step"><span>{n}</span><div><h3>{title}</h3><p>{body}</p></div></div>}

export default function Dashboard(){
 const user=useCurrentUser(); const[movies,setMovies]=useState([]); const[rooms,setRooms]=useState([]);
 useEffect(()=>{if(!user)return;Promise.all([fetch('/api/movies').then(r=>r.json()),fetch('/api/rooms').then(r=>r.json())]).then(([m,r])=>{setMovies(m.movies||[]);setRooms(r.rooms||[])}).catch(()=>{});},[user]);
 if(!user)return null;
 const firstName=(user.username||'friend').split(/\s+/)[0];
 return <main className="wt-page cin-home"><Nav username={user.username}/><div className="wt-shell cin-shell">
   <section className="cin-hero-panel">
    <div className="cin-hero-glow"/><div className="relative z-10">
      <p className="cin-eyebrow">NOW SHOWING · YOUR CINEMA</p>
      <h1 className="cin-display">Welcome back, {firstName}.<br/><span>The screen is still dark.</span></h1>
      <p className="cin-lead">Upload a movie you own to fill the projection booth, open a room around a YouTube link, or start watching together tonight.</p>
      <div className="flex flex-wrap gap-3 mt-7"><Link href="/library" className="wt-button wt-button-primary">Upload a movie <span className="ml-2">↗</span></Link><Link href="/rooms/create" className="wt-button wt-button-ghost">Create a room <span className="ml-2">→</span></Link></div>
    </div>
   </section>

   <section className="cin-stats-grid">
    <Stat label="IN LIBRARY" value={movies.length} caption="Movies you own" icon="▤"/>
    <Stat label="READY" value={movies.length} caption="Ready to watch" icon="◷"/>
    <Stat label="LIVE ROOMS" value={rooms.length} caption="Screenings happening" icon="◉"/>
    <Stat label="INVITES" value="0" caption="Rooms you have joined" icon="↗"/>
   </section>

   <section className="cin-section cin-steps-section"><div><p className="cin-eyebrow">YOUR FIRST SCREENING</p><h2 className="cin-heading">Three steps to your first screening.</h2><p className="cin-muted mt-2">Two of them are “click a button.”</p></div><div className="cin-steps-grid"><Step n="01" title="Bring a file, or bring a link" body="Upload a movie you own, or skip straight to a room around a YouTube link, Drive video, or supported direct media URL."/><Step n="02" title="Open a room, invite your people" body="A room takes seconds and comes with a private invite link, synchronized playback, chat and reactions."/><Step n="03" title="Press play, stay together" body="Anyone can play, pause, or seek when the room allows it. The host controls the canonical room clock."/></div></section>

   <section className="cin-section"><div className="cin-section-head"><div><p className="cin-eyebrow">LIVE ROOMS</p><h2 className="cin-heading">Tonight's screenings</h2><p className="cin-muted mt-2">Rooms you're hosting, and the ones you've been invited into.</p></div><Link href="/rooms" className="cin-all-link">ALL ROOMS →</Link></div>
    {rooms.length===0?<div className="cin-empty"><span>◌</span><div><p>No screenings yet.</p><small>Create a private room and invite your people.</small></div><Link href="/rooms/create" className="wt-button wt-button-primary">Create room →</Link></div>:<div className="cin-room-list">{rooms.slice(0,5).map(r=><Link key={r.id} href={`/room/${r.code}`} className="cin-room-row"><div><div className="flex items-center gap-2"><span className="cin-live-dot"/> <span className="cin-room-status">ACTIVE</span></div><h3>{r.name}</h3><p>{r.original_video_title||r.video_title||'Untitled screening'} · {r.max_participants||5} seats</p></div><div className="cin-room-right"><span className="cin-room-badge">{r.code}</span><span>Enter room →</span></div></Link>)}</div>}
   </section>

   <section className="cin-section cin-next-section"><div className="cin-section-head"><div><p className="cin-eyebrow">THE LOBBY</p><h2 className="cin-heading">Where to next?</h2><p className="cin-muted mt-2">Everything else the cinema does, one door each.</p></div></div><div className="cin-next-grid"><Link href="/library" className="cin-next-card"><span>▤</span><div><b>Upload a movie</b><small>Add a film to your private shelf for streaming.</small></div><i>→</i></Link><Link href="/library" className="cin-next-card"><span>⌂</span><div><b>Your library</b><small>Search, stream and manage your uploads.</small></div><i>→</i></Link><Link href="/rooms/create" className="cin-next-card"><span>▣</span><div><b>Open a room</b><small>Start from a private YouTube link, Drive video or library source.</small></div><i>→</i></Link><Link href="/rooms" className="cin-next-card"><span>↗</span><div><b>Past screenings</b><small>Rooms you've created or joined before.</small></div><i>→</i></Link></div></section>
  </div></main>
}
