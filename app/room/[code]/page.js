"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import Nav from '../../../components/Nav';
import VideoPlayer from '../../../components/VideoPlayer';
import YouTubePlayer from '../../../components/YouTubePlayer';
import Chat from '../../../components/Chat';
import Queue from '../../../components/Queue';
import SourcePicker from '../../../components/SourcePicker';
import CallPanel from '../../../components/CallPanel';
import {getPusherClient} from '../../../lib/pusher-client';

const PRESETS=[1,2,3,5,10];
const EMOJIS=['😂','❤️','😮','👏','🔥','😭'];
const isPCloudRef=(value)=>typeof value==='string'&&value.startsWith('pcloud:');

export default function RoomPage({params}){
 const code=params.code.toUpperCase(),router=useRouter();
 const[user,setUser]=useState(),[room,setRoom]=useState(),[channel,setChannel]=useState(null),[socketId,setSocketId]=useState(null),[participants,setParticipants]=useState([]),[joinState,setJoinState]=useState('checking'),[joinError,setJoinError]=useState(''),[copied,setCopied]=useState(false),[tab,setTab]=useState('chat'),[sourceOpen,setSourceOpen]=useState(false),[adding,setAdding]=useState(false),[capacity,setCapacity]=useState('');
 const[playback,setPlayback]=useState({url:'',title:'',source:'',ref:'',version:0,time:0,playing:false,updatedAt:0}),[autoplay,setAutoplay]=useState(false),[playbackReady,setPlaybackReady]=useState(false);
 const playbackRef=useRef(playback.ref),playbackSource=useRef(playback.source);
 useEffect(()=>{playbackRef.current=playback.ref;playbackSource.current=playback.source},[playback.ref,playback.source]);
 useEffect(()=>{
  let cancelled=false;
  const load=async()=>{
    try{
      const [meRes,roomRes]=await Promise.all([
        fetch('/api/auth/me',{cache:'no-store'}),
        fetch(`/api/rooms/${code}`,{cache:'no-store'})
      ]);
      const me=await meRes.json().catch(()=>({}));
      const rd=await roomRes.json().catch(()=>({}));
      if(cancelled)return;
      if(!meRes.ok||!me.user){router.push(`/login?redirect=${encodeURIComponent(`/room/${code}`)}`);return}
      setUser(me.user);
      if(!roomRes.ok){setRoom(null);return}
      setRoom(rd.room);
      const ref=rd.room.current_video_url||rd.room.video_url||'';
      const playable=rd.room.playable_current_video_url||rd.room.playable_video_url||ref;
      setPlayback({url:playable,title:rd.room.current_video_title||rd.room.video_title||'',source:rd.room.current_video_source||rd.room.video_source||'',ref,version:0,time:Number(rd.room.playback_time)||0,playing:!!rd.room.playback_playing,updatedAt:Number(rd.room.playback_updated_at)||0});
      setPlaybackReady(!String(ref).startsWith('pcloud:'));
    }catch{if(!cancelled)setJoinError('Could not load your room.')}
  };
  load();
  return()=>{cancelled=true};
},[router,code]);
 const hydrate=useCallback(async()=>{const r=await fetch(`/api/rooms/${code}`,{cache:'no-store'});const d=await r.json();if(!r.ok){setRoom(null);return}setRoom(d.room);const ref=d.room.current_video_url||d.room.video_url||'';const playable=d.room.playable_current_video_url||d.room.playable_video_url||ref;setPlayback(p=>{const source=d.room.current_video_source||d.room.video_source||'';const changed=p.ref!==ref||p.source!==source||p.url!==playable;return {url:playable,title:d.room.current_video_title||d.room.video_title||'',source,ref,version:changed?p.version+1:p.version,time:Number(d.room.playback_time)||0,playing:!!d.room.playback_playing,updatedAt:Number(d.room.playback_updated_at)||0}});
 setPlaybackReady(!String(ref).startsWith('pcloud:'));},[code]);
 useEffect(()=>{hydrate().catch(()=>setRoom(null))},[hydrate]);
 useEffect(()=>{if(room)setCapacity(String(room.max_participants||''))},[room?.max_participants]);
 useEffect(()=>{if(!user||!room)return;let cancelled=false;setJoinState('connecting');setJoinError('');fetch(`/api/rooms/${code}/presence`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'join'}),cache:'no-store'}).then(async r=>({r,d:await r.json().catch(()=>({}))})).then(({r,d})=>{if(cancelled)return;if(!r.ok||!d.ok){setJoinError(d.error||'This room is full.');setJoinState('denied');return}setJoinState('joined')}).catch(()=>{if(!cancelled){setJoinError('Could not join the room. Check your database connection.');setJoinState('denied')}});return()=>{cancelled=true}},[user?.id,room?.id,code]);
 // Do not remove presence when the user navigates to Library/Home/Settings/etc.
 // Only the explicit Leave button releases the active room seat. The persistent
 // room_access record keeps this room visible in Watch Rooms for re-entry.
 async function leaveRoom(){
   try {
     await fetch(`/api/rooms/${code}/presence`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'leave'}),keepalive:true});
   } finally {
     router.push('/rooms');
   }
 }
 async function resolveRoomPlayback(ref, fallbackUrl, cancelledRef){
   if(!isPCloudRef(ref)) return fallbackUrl||ref||'';
   if(cancelledRef) return '';
   // Production-safe path: ask Railway for a FRESH pCloud playback URL.
   // Do not hand the browser a cached /api/storage/stream redirect. Railway
   // can run more than one instance, while pCloud content URLs are temporary.
   const url=`/api/storage/playback-url?room=${encodeURIComponent(code)}&v=${encodeURIComponent(ref)}&t=${Date.now()}`;
   const r=await fetch(url,{cache:'no-store',credentials:'include'});
   const d=await r.json().catch(()=>({}));
   if(!r.ok||!d.url) throw new Error(d.error||`Could not create playback URL (HTTP ${r.status})`);
   return d.url;
 }
 useEffect(()=>{if(!user||!room||joinState!=='joined')return;let cancelled=false;let p=null,name=`presence-room-${code}`,ch=null,onConnected=null;try{ 
p=getPusherClient();onConnected=()=>setSocketId(p.connection.socket_id);p.connection.bind('connected',onConnected);if(p.connection.state==='connected')onConnected();ch=p.subscribe(name);ch.bind('pusher:subscription_succeeded',m=>{const list=[];m.each(x=>list.push({id:x.id,username:x.info.username,isHost:!!x.info.isHost}));if(!cancelled&&list.length)setParticipants(list)});ch.bind('pusher:member_added',m=>setParticipants(x=>x.some(q=>String(q.id)===String(m.id))?x:[...x,{id:m.id,username:m.info?.username||'Guest',isHost:!!m.info?.isHost}]));ch.bind('pusher:member_removed',m=>setParticipants(x=>x.filter(q=>String(q.id)!==String(m.id))));ch.bind('pusher:subscription_error',()=>setJoinError('Realtime connection unavailable. The room is using database sync.'));ch.bind('room:video-changed',async d=>{const ref=d.videoRef||d.videoUrl||'';const url=await resolveRoomPlayback(ref,d.videoUrl,cancelled);if(cancelled)return;setAutoplay(!!d.autoplay);setPlaybackReady(false);setRoom(r=>r?({...r,current_video_url:ref,current_video_title:d.videoTitle||r.current_video_title,current_video_source:d.videoSource||r.current_video_source,playback_time:0,playback_playing:!!d.autoplay,playback_updated_at:Date.now()}):r);setPlayback({url,title:d.videoTitle||'',source:d.videoSource||'',ref,version:Date.now(),time:0,playing:!!d.autoplay,updatedAt:Date.now()});setPlaybackReady(true)});ch.bind('room:capacity-changed',d=>setRoom(r=>({...r,max_participants:d.maxParticipants})));setChannel(ch)}catch(error){setJoinError('Realtime service unavailable. The room is using database sync.')}return()=>{cancelled=true;try{if(p){p.unsubscribe(name);if(onConnected)p.connection.unbind('connected',onConnected)}}catch{}setChannel(null)}},[user?.id,room?.id,code,joinState]);
 useEffect(()=>{
   if(joinState!=='joined'||!room)return;
   let cancelled=false;
   const ref=room.current_video_url||room.video_url||'';
   if(!isPCloudRef(ref)){setPlaybackReady(true);return()=>{cancelled=true}}
   setPlaybackReady(false);
   resolveRoomPlayback(ref,playback.url,cancelled).then(url=>{if(cancelled)return;setPlayback(p=>({...p,url,ref,version:p.version+1}));setPlaybackReady(true)});
   return()=>{cancelled=true};
 },[joinState,room?.id,room?.current_video_url,room?.video_url]);
 useEffect(()=>{if(joinState!=='joined')return;const i=setInterval(()=>fetch(`/api/rooms/${code}/presence`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'heartbeat'})}).catch(()=>{}),12000);return()=>clearInterval(i)},[joinState,code]);
 // Do not poll the full room every second. Playback heartbeats and source changes
 // travel through realtime; a slow fallback poll is only used to recover from
 // dropped realtime events. This avoids repeated DB work and player remounts.
 useEffect(()=>{
   if(joinState!=='joined')return;
   let cancelled=false;
   const resolveCurrent=async()=>{
     try{
       const r=await fetch(`/api/rooms/${code}/sync`,{cache:'no-store'});
       if(!r.ok||cancelled)return;
       const d=await r.json(); if(!d.room)return;
       const ref=d.room.current_video_url||d.room.video_url||'';
       const source=d.room.current_video_source||d.room.video_source||'';
       setRoom(prev=>{
         if(!prev)return prev;
         const sameSource=prev.current_video_url===ref&&prev.current_video_source===source;
         const samePlayback=Number(prev.playback_time||0)===Number(d.room.playback_time||0)&&!!prev.playback_playing===!!d.room.playback_playing&&Number(prev.playback_updated_at||0)===Number(d.room.playback_updated_at||0);
         if(sameSource&&samePlayback)return prev;
         return {...prev,current_video_url:ref,current_video_title:d.room.current_video_title||d.room.video_title,current_video_source:source,playback_time:d.room.playback_time,playback_playing:d.room.playback_playing,playback_updated_at:d.room.playback_updated_at};
       });
       const sourceChanged = playbackRef.current !== ref || playbackSource.current !== source;
       const nextUrl = sourceChanged ? await resolveRoomPlayback(ref,d.room.playable_current_video_url||ref,false) : null;
       if(sourceChanged){ setPlaybackReady(false); }
       setPlayback(prev=>{
         const changed=prev.ref!==ref||prev.source!==source;
         return {...prev,url:changed?(nextUrl||prev.url):prev.url,title:d.room.current_video_title||d.room.video_title||'',source,ref,version:changed?prev.version+1:prev.version,time:Number(d.room.playback_time)||0,playing:!!d.room.playback_playing,updatedAt:Number(d.room.playback_updated_at)||0};
       });
       if(sourceChanged) setPlaybackReady(true);
     }catch{}
   };
   resolveCurrent();
   const i=setInterval(resolveCurrent,4000);
   return()=>{cancelled=true;clearInterval(i)};
 },[joinState,code]);
 useEffect(()=>{if(joinState!=='joined')return;let cancelled=false;const refresh=async()=>{try{const r=await fetch(`/api/rooms/${code}/presence`,{cache:'no-store'});const d=await r.json();if(!cancelled&&Array.isArray(d.members))setParticipants(d.members)}catch{}};refresh();const i=setInterval(refresh,2000);return()=>{cancelled=true;clearInterval(i)}},[joinState,code]);
 const broadcast=useCallback((event,data)=>{fetch(`/api/rooms/${code}/broadcast`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event,data,socketId})}).catch(()=>{})},[code,socketId]);
 const isHost=!!(user&&room&&user.id===room.host_id), currentVideoUrl=playback.url||room?.playable_current_video_url||room?.current_video_url||room?.video_url, currentVideoTitle=playback.title||room?.current_video_title||room?.video_title||'Untitled video', currentVideoSource=playback.source||room?.current_video_source||room?.video_source;
 const sourceLabel=useMemo(()=>({library:'Library',youtube:'YouTube',drive:'Google Drive',url:'Web video'})[currentVideoSource]||'Video',[currentVideoSource]);
 async function addQueue(url){setAdding(true);try{const r=await fetch(`/api/rooms/${code}/queue`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({videoUrl:url})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not add video');setSourceOpen(false)}catch(e){alert(e.message)}finally{setAdding(false)}}
 async function playOriginal(){const r=await fetch(`/api/rooms/${code}/queue/original`,{method:'POST'});const d=await r.json();if(!r.ok)return alert(d.error||'Could not restore original');const ref=d.videoRef||d.room.original_video_url||d.room.video_url;const url=await resolveRoomPlayback(ref,d.playableVideoUrl,false);setAutoplay(true);setPlaybackReady(false);setRoom(x=>x?({...x,...d.room,playback_time:0,playback_playing:true,playback_updated_at:Date.now()}):x);setPlayback({url,title:d.room.original_video_title||d.room.video_title,source:d.room.original_video_source||d.room.video_source,ref,version:Date.now(),time:0,playing:true,updatedAt:Date.now()});setPlaybackReady(true)}
 async function capacityUpdate(n){n=Number(n);if(!Number.isInteger(n)||n<1||n>500)return;const r=await fetch(`/api/rooms/${code}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({maxParticipants:n})});const d=await r.json();if(r.ok)setRoom(x=>({...x,max_participants:d.room.max_participants}));}
 function copy(){navigator.clipboard.writeText(`${window.location.origin}/invite/${code}`);setCopied(true);setTimeout(()=>setCopied(false),1500)}
 if(user===undefined||room===undefined)return <main className="wt-page"><Nav username={user?.username}/><div className="wt-shell py-24 text-center text-white/35">Loading your room…</div></main>;
 if(room===null)return <main className="wt-page"><Nav username={user?.username}/><div className="wt-shell py-24 text-center"><h1 className="font-display text-5xl">Room not found.</h1><p className="text-sm text-white/35 mt-3">Check the invitation code and try again.</p><Link href="/rooms" className="wt-button wt-button-ghost inline-block mt-6">Back to rooms</Link></div></main>;
 return <main className="wt-page"><Nav username={user.username}/><div className="wt-shell py-7 sm:py-10">
  <div className="flex flex-wrap items-center justify-between gap-4 mb-7"><div><Link href="/rooms" className="text-[10px] uppercase tracking-[.2em] text-white/30">← Back to rooms</Link><div className="flex items-center gap-2 mt-4"><p className="eyebrow">PRIVATE WATCH ROOM</p><span className="status-pill status-live">ACTIVE</span></div><h1 className="font-display text-5xl sm:text-6xl mt-2">{room.name}</h1><div className="flex flex-wrap gap-2 mt-4 text-xs text-white/40"><span className="status-pill font-mono tracking-[.12em]">{code}</span><span>{participants.length}/{room.max_participants} people</span><span>Host controls playback</span></div></div><div className="flex gap-2"><button onClick={copy} className="wt-button wt-button-ghost">{copied?'Copied':'Copy invite'}</button><Link href={`/invite/${code}`} className="wt-button wt-button-ghost">Share invite</Link><button onClick={leaveRoom} className="wt-button wt-button-danger">Leave room</button></div></div>
  {joinError&&<div className="mb-5 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{joinError}</div>}
  {joinState!=='joined'?<div className="wt-card p-16 text-center"><div className="brand-mark mx-auto">V</div><h2 className="font-display text-4xl mt-5">{joinState==='denied'?'No seat available.':'Preparing the room…'}</h2><p className="text-sm text-white/35 mt-3">{joinState==='denied'?'Ask the host to increase the room size.':'Connecting you to live playback, chat and room presence.'}</p></div>:
  <>
   <div className="grid xl:grid-cols-[minmax(0,1fr)_390px] gap-5">
    <section className="min-w-0">
      <div className="rounded-3xl overflow-hidden border border-white/[.1] bg-black shadow-2xl relative">
       {!playbackReady?<div className="aspect-video flex items-center justify-center bg-black text-white/45 text-sm">Preparing the video stream…</div>:currentVideoSource==='youtube'?<YouTubePlayer videoId={currentVideoUrl} channel={channel} broadcast={broadcast} canControl={isHost} initialSync={{time:playback.time||0,playing:!!playback.playing,updatedAt:playback.updatedAt||0}} autoplayOnSourceChange={autoplay}/>:<VideoPlayer videoUrl={currentVideoUrl} channel={channel} broadcast={broadcast} canControl={isHost} autoplayOnSourceChange={autoplay} initialSync={{time:playback.time||0,playing:!!playback.playing,updatedAt:playback.updatedAt||0}} onPlaybackError={async()=>{try{const ref=playbackRef.current||room?.current_video_url||room?.video_url||"";if(!isPCloudRef(ref))return;const url=await resolveRoomPlayback(ref,"",false);setPlayback(p=>({...p,url,version:p.version+1}));}catch(error){setJoinError(error?.message||"Could not refresh the video stream.")}}}/>} 
       <div className="absolute top-4 left-4 flex gap-2 pointer-events-none"><span className="status-pill bg-black/65">{sourceLabel}</span>{isHost&&<span className="status-pill bg-black/65">HOST</span>}</div>
       <div className="absolute top-4 right-4 flex gap-1.5"><div className="rounded-xl bg-black/60 backdrop-blur px-2 py-1 text-xs">{EMOJIS.map(e=><button key={e} onClick={()=>broadcast('reaction:show',{emoji:e})} className="px-1.5 hover:scale-125 transition">{e}</button>)}</div></div>
      </div>
      <div className="wt-card mt-3 p-5"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"><div><p className="eyebrow">NOW PLAYING</p><h2 className="text-lg font-semibold mt-1">{currentVideoTitle}</h2><p className="text-xs text-white/30 mt-1">{sourceLabel} · synchronized with the room host</p></div>{isHost&&<button onClick={()=>setSourceOpen(true)} className="wt-button wt-button-primary">+ Add video</button>}</div></div>
    </section>
    <aside className="wt-card overflow-hidden min-h-[560px] flex flex-col"><div className="grid grid-cols-4 border-b border-white/[.07] p-1 bg-black/10">{[['chat','Chat'],['people','People'],['call','Call'],['details','Details']].map(([id,label])=><button key={id} onClick={()=>setTab(id)} className={`py-3 rounded-xl text-xs font-medium ${tab===id?'bg-[#d95b55] text-white':'text-white/40 hover:text-white'}`}>{label}</button>)}</div><div className="flex-1 p-4 min-h-0">{tab==='chat'&&<div className="h-[510px]"><Chat channel={channel} broadcast={broadcast} username={user.username} userId={user.id} participants={participants} isHost={isHost} roomCode={code} onAddToQueue={addQueue}/></div>}{tab==='people'&&<div><div className="flex items-center justify-between mb-5"><div><p className="eyebrow">ROOM PEOPLE</p><h3 className="text-lg font-semibold mt-1">{participants.length} watching</h3></div><span className="status-pill status-live">LIVE</span></div><div className="space-y-2">{participants.map(p=><div key={p.id} className="flex items-center gap-3 rounded-xl border border-white/[.06] bg-white/[.02] p-3"><div className="avatar">{p.username.slice(0,1).toUpperCase()}</div><div className="flex-1"><p className="text-sm">{p.username}{p.id===user.id?' (You)':''}</p><p className="text-[11px] text-white/30">{p.isHost?'Host':'Viewer'}</p></div>{p.isHost&&<span className="status-pill">HOST</span>}</div>)}</div></div>}<div className={tab==='call'?'':'hidden'}><CallPanel channel={channel} broadcast={broadcast} userId={user.id} username={user.username} participants={participants} roomCode={code}/></div> {tab==='details'&&<div className="space-y-6"><div><p className="eyebrow">ROOM DETAILS</p><h3 className="text-lg font-semibold mt-1">{room.name}</h3><p className="text-sm text-white/40 mt-2">{room.original_video_title||room.video_title||'Original room video'}</p></div><div className="grid grid-cols-2 gap-2"><div className="rounded-xl bg-white/[.03] p-4"><p className="text-xs text-white/30">Source</p><p className="text-sm mt-1">{sourceLabel}</p></div><div className="rounded-xl bg-white/[.03] p-4"><p className="text-xs text-white/30">Capacity</p><p className="text-sm mt-1">{room.max_participants}</p></div></div>{isHost&&<div><p className="text-xs text-white/40 mb-2">Room size</p><div className="flex flex-wrap gap-2">{PRESETS.map(n=><button key={n} onClick={()=>capacityUpdate(n)} className={`wt-button ${Number(room.max_participants)===n?'wt-button-primary':'wt-button-ghost'}`}>{n}</button>)}<input value={capacity} onChange={e=>setCapacity(e.target.value.replace(/\D/g,'').slice(0,3))} onBlur={()=>capacityUpdate(capacity)} className="wt-input w-24"/></div></div>}</div>}</div></aside>
   </div>
   <Queue code={code} channel={channel} isHost={isHost} currentVideoTitle={currentVideoTitle} currentVideoUrl={currentVideoUrl} originalVideoTitle={room.original_video_title||room.video_title} originalVideoUrl={room.original_video_url||room.video_url} onPlayOriginal={playOriginal} onVideoChange={async v=>{const ref=v.videoRef||v.videoUrl||'';const url=await resolveRoomPlayback(ref,v.videoUrl,false);setAutoplay(!!v.autoplay);setPlaybackReady(false);setRoom(x=>x?({...x,current_video_url:ref,current_video_title:v.videoTitle||x.current_video_title,current_video_source:v.videoSource||x.current_video_source,playback_time:0,playback_playing:!!v.autoplay,playback_updated_at:Date.now()}):x);setPlayback({url,title:v.videoTitle||'',source:v.videoSource||'',ref,version:Date.now(),time:0,playing:!!v.autoplay,updatedAt:Date.now()});setPlaybackReady(true)}} onAddVideo={()=>setSourceOpen(true)}/>
  </>}
 </div><SourcePicker open={sourceOpen} onClose={()=>!adding&&setSourceOpen(false)} onSubmit={addQueue} busy={adding} title="Add to the room queue"/></main>
}
