"use client";
import {useEffect,useRef,useState} from "react";

const HARD_SEEK_TOLERANCE=3.5;
const SOFT_DRIFT_TOLERANCE=0.45;
const REMOTE_GUARD_MS=1000;

export default function VideoPlayer({videoUrl,channel,broadcast,canControl,onPlaybackError,autoplayOnSourceChange=false,initialSync}){
 const videoRef=useRef(null),remoteGuard=useRef(0),buffering=useRef(false),sourceChanging=useRef(false),syncRef=useRef(initialSync||null),rateTimer=useRef(null);
 const[reactions,setReactions]=useState([]),[needsPlay,setNeedsPlay]=useState(false),[bufferingUi,setBufferingUi]=useState(false),[streamError,setStreamError]=useState("");
 useEffect(()=>{syncRef.current=initialSync||null},[initialSync]);
 function remote(){remoteGuard.current=Date.now()+REMOTE_GUARD_MS}
 function restoreRate(){if(rateTimer.current)clearTimeout(rateTimer.current);const v=videoRef.current;if(v)v.playbackRate=1}
 function gentlyCorrect(target){const v=videoRef.current;if(!v)return;const drift=target-v.currentTime;if(Math.abs(drift)>=HARD_SEEK_TOLERANCE){try{v.currentTime=Math.max(0,target)}catch{}restoreRate();return}if(Math.abs(drift)>SOFT_DRIFT_TOLERANCE&& !v.paused){v.playbackRate=drift>0?1.035:0.965;if(rateTimer.current)clearTimeout(rateTimer.current);rateTimer.current=setTimeout(restoreRate,1200)}else restoreRate()}
 async function startPlayback(userGesture=false){const v=videoRef.current;if(!v)return false;try{if(userGesture){v.muted=false;v.volume=1}await v.play();setNeedsPlay(false);return true}catch(error){if(!userGesture){
    // Viewers may be allowed to autoplay only when muted. Hosts must never be
    // silently muted: if audible autoplay is blocked, keep audio enabled and
    // show the explicit Resume button so the next click is a user gesture.
    if(canControl){v.muted=false;v.volume=1;setNeedsPlay(true);return false}
    try{v.muted=true;v.volume=1;await v.play();setNeedsPlay(true);return true}catch{}
  }
  setNeedsPlay(true);return false}}
 useEffect(()=>{if(canControl)return;const v=videoRef.current,s=initialSync;if(!v||!s||!Number.isFinite(Number(s.time)))return;remote();let target=Math.max(0,Number(s.time));if(s.playing&&Number(s.updatedAt)>0)target+=Math.max(0,(Date.now()-Number(s.updatedAt))/1000);gentlyCorrect(target);if(s.playing&&v.paused&&!buffering.current)startPlayback(false);if(!s.playing){v.pause();restoreRate()}},[initialSync,canControl]);
 useEffect(()=>{const v=videoRef.current;if(!v||!videoUrl)return;let cancelled=false;sourceChanging.current=true;remote();setNeedsPlay(false);setStreamError("");setBufferingUi(true);v.pause();v.muted=false;v.volume=1;v.src=videoUrl;v.preload="auto";v.load();const start=async()=>{if(cancelled||!videoRef.current)return;const s=syncRef.current;if(s&&Number.isFinite(Number(s.time))){let target=Math.max(0,Number(s.time));if(s.playing&&Number(s.updatedAt)>0)target+=Math.max(0,(Date.now()-Number(s.updatedAt))/1000);try{if(target<=(v.duration||Infinity))v.currentTime=target}catch{}}const shouldPlay=!!(autoplayOnSourceChange||s?.playing);if(shouldPlay)await startPlayback(false);else v.pause();if(!cancelled){sourceChanging.current=false;setBufferingUi(false)}};if(v.readyState>=2)start();else v.addEventListener("canplay",start,{once:true});return()=>{cancelled=true;v.removeEventListener("canplay",start);sourceChanging.current=false;restoreRate()}},[videoUrl,autoplayOnSourceChange]);
 function emit(action){if(!canControl||!broadcast||Date.now()<remoteGuard.current)return;const v=videoRef.current;if(!v)return;broadcast("player:action",{action,time:v.currentTime,playing:!v.paused})}
 useEffect(()=>{if(!channel)return;const v=videoRef.current;if(!v)return;
  const apply=({time,playing,updatedAt})=>{if(!Number.isFinite(Number(time)))return;remote();let target=Number(time);if(playing&&Number(updatedAt)>0)target+=Math.max(0,(Date.now()-Number(updatedAt))/1000);gentlyCorrect(target);if(playing&&v.paused&&!buffering.current)startPlayback(false);if(!playing&&!v.paused){v.pause();restoreRate()}};
  const action=({action,time,playing,updatedAt})=>{remote();let target=Number(time);if(Number.isFinite(target)){if(playing&&Number(updatedAt)>0)target+=Math.max(0,(Date.now()-Number(updatedAt))/1000);gentlyCorrect(target)}if(action==="play"){startPlayback(false)}else if(action==="pause"){v.pause();restoreRate()}else if(action==="seek"&&playing)startPlayback(false)};
  const request=()=>{if(canControl&&broadcast)broadcast("player:heartbeat",{time:v.currentTime,playing:!v.paused,updatedAt:Date.now()})};
  const reaction=({emoji})=>{const id=Math.random().toString(36).slice(2);setReactions(r=>[...r,{id,emoji,left:10+Math.random()*80}]);setTimeout(()=>setReactions(r=>r.filter(x=>x.id!==id)),2000)};
  channel.bind("player:action",action);channel.bind("player:heartbeat",apply);channel.bind("player:request-sync",request);channel.bind("reaction:show",reaction);if(v.readyState>=1)broadcast?.("player:request-sync",{});else v.addEventListener("loadedmetadata",request,{once:true});
  return()=>{channel.unbind("player:action",action);channel.unbind("player:heartbeat",apply);channel.unbind("player:request-sync",request);channel.unbind("reaction:show",reaction);v.removeEventListener("loadedmetadata",request)}
 },[channel,broadcast,canControl,videoUrl]);
 useEffect(()=>{if(!broadcast||!canControl)return;const i=setInterval(()=>{const v=videoRef.current;if(!v||Date.now()<remoteGuard.current||sourceChanging.current)return;broadcast("player:heartbeat",{time:v.currentTime,playing:!v.paused,updatedAt:Date.now()})},2500);return()=>clearInterval(i)},[broadcast,canControl]);
 return <div className="relative rounded-xl overflow-hidden bg-black shadow-2xl shadow-black/50">
   <video ref={videoRef} src={videoUrl} controls={canControl} playsInline referrerPolicy="no-referrer" preload="auto" className="w-full aspect-video" onWaiting={()=>{buffering.current=true;setBufferingUi(true)}} onCanPlay={()=>{buffering.current=false;setBufferingUi(false)}} onPlaying={()=>{buffering.current=false;setBufferingUi(false);if(!sourceChanging.current&&Date.now()>=remoteGuard.current)emit("play")}} onPause={()=>{if(!sourceChanging.current&&!buffering.current&&Date.now()>=remoteGuard.current)emit("pause")}} onSeeked={()=>{if(!sourceChanging.current&&Date.now()>=remoteGuard.current&&canControl)emit("seek")}} onError={(e)=>{buffering.current=false;setBufferingUi(false);setStreamError(e.currentTarget?.error?.message||"The video stream could not be loaded.");onPlaybackError?.()}}/>
   {bufferingUi&&<div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="rounded-full bg-black/70 px-4 py-2 text-xs text-white/70 backdrop-blur">Buffering video…</div></div>}
   {!canControl&&<div className="absolute top-3 right-3 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur text-xs text-neutral-300 pointer-events-none">🔒 Host controls playback</div>}
   {needsPlay&&<button onClick={()=>startPlayback(true)} className="absolute inset-0 m-auto w-fit h-fit rounded-full bg-[#d95b55] text-white px-6 py-3 text-sm font-semibold shadow-2xl hover:scale-[1.02] transition">▶ {canControl?"Resume video":"Join playback & enable sound"}</button>}
   {streamError&&<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75 px-6 text-center"><p className="text-sm text-red-200">Video stream could not be loaded.</p><button onClick={()=>{setStreamError("");const v=videoRef.current;if(v){v.load();startPlayback(false)}}} className="wt-button wt-button-primary !py-2 !px-4">Retry stream</button></div>}
   {reactions.map(r=><span key={r.id} className="absolute bottom-10 text-3xl animate-bounce pointer-events-none" style={{left:`${r.left}%`}}>{r.emoji}</span>)}
 </div>;
}
