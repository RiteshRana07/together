"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Nav from "../../components/Nav";
import { useCurrentUser } from "../../lib/use-current-user";

export default function RoomsPage(){
 const user=useCurrentUser(); const router=useRouter(); const[rooms,setRooms]=useState(); const[code,setCode]=useState(''); const[error,setError]=useState('');
 useEffect(()=>{if(user)fetch('/api/rooms').then(r=>r.json()).then(d=>setRooms(d.rooms||[])).catch(()=>setRooms([]))},[user]);
 if(!user)return null;
 async function join(e){e.preventDefault();const c=code.trim().toUpperCase();if(!c)return setError('Enter a room code');const r=await fetch(`/api/rooms/${c}`);if(!r.ok)return setError('No room found with that code');router.push(`/room/${c}`)}
 async function del(c,isHost){
  const label=isHost?'Delete this room for everyone?':'Remove this room from your Watch Rooms?';
  if(!confirm(label))return;
  const endpoint=isHost?`/api/rooms/${c}`:`/api/rooms/${c}/access`;
  const r=await fetch(endpoint,{method:'DELETE'});
  if(r.ok)setRooms(x=>x.filter(item=>item.code!==c));
  else {const d=await r.json().catch(()=>({}));setError(d.error||'Could not remove the room');}
 }
 return <main className="wt-page cin-home"><Nav username={user.username}/><div className="wt-shell cin-shell">
   <section className="cin-rooms-header"><div><p className="cin-eyebrow">WATCH TOGETHER</p><h1 className="cin-display cin-display-small">Private rooms.</h1><p className="cin-lead cin-lead-small">Create a room for your library, invite friends, and watch together in perfect sync.</p></div><div className="cin-room-actions"><Link href="/rooms" className="wt-button wt-button-ghost">◷ History</Link><Link href="/rooms/create" className="wt-button wt-button-primary">+ Create room</Link></div></section>
   <section className="cin-room-layout"><div className="cin-room-main">
    {rooms===undefined?<div className="cin-loading-grid">{[1,2].map(i=><div key={i} className="cin-loading-card"/> )}</div>:rooms.length===0?<div className="cin-empty"><span>◌</span><div><p>No private rooms yet.</p><small>Create your first screening to see it here.</small></div><Link href="/rooms/create" className="wt-button wt-button-primary">Create room →</Link></div>:<div className="cin-private-list">{rooms.map(r=><Link key={r.id} href={`/room/${r.code}`} className="cin-private-card"><div className="flex justify-between gap-4"><div><div className="flex items-center gap-2"><span className="cin-live-dot"/><span className="cin-room-status">ACTIVE</span></div><h2>{r.name}</h2><p>{r.original_video_title||r.video_title||'Untitled screening'} · {r.max_participants||5} seats</p></div><span className="cin-room-badge">{r.code}</span></div><div className="cin-private-footer"><span>Private screening</span><span onClick={(e)=>{e.preventDefault();e.stopPropagation();del(r.code,!!r.is_host)}} className="cin-delete">{r.is_host?'Delete':'Remove'}</span><span>Enter room →</span></div></Link>)}</div>}
   </div><aside className="cin-join-card"><p className="cin-eyebrow">LIVE ON INVITATION</p><h2>Join a private room.</h2><p>Enter the invitation code from your host.</p><form onSubmit={join}><label>ROOM CODE</label><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} maxLength={12} placeholder="AB12CD34"/>{error&&<div className="cin-form-error">{error}</div>}<button className="wt-button wt-button-primary w-full">Join private room →</button></form></aside></section>
   <section className="cin-section cin-rooms-how"><p className="cin-eyebrow">YOUR FIRST SCREENING</p><h2 className="cin-heading">Three steps to your first screening.</h2><p className="cin-muted mt-2">Two of them are “click a button.”</p><div className="cin-steps-grid mt-7"><div className="cin-step"><span>01</span><div><h3>Bring a file, or bring a link</h3><p>Choose a library video or use YouTube, Google Drive or a supported browser-playable URL.</p></div></div><div className="cin-step"><span>02</span><div><h3>Open a room, invite your people</h3><p>Share one private invite link and control the room size from the host panel.</p></div></div><div className="cin-step"><span>03</span><div><h3>Press play, stay together</h3><p>Playback, queue changes, chat and reactions travel through the room in real time.</p></div></div></div></section>
 </div></main>
}
