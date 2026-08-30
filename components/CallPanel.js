"use client";
import {useCallback,useEffect,useRef,useState} from "react";

const FREE_ICE_SERVERS=[
  {urls:"stun:stun.l.google.com:19302"},
  {urls:"stun:stun1.l.google.com:19302"},
  {urls:"stun:stun2.l.google.com:19302"},
  {urls:"stun:stun3.l.google.com:19302"},
  {urls:"stun:stun4.l.google.com:19302"},
];

export default function CallPanel({channel,broadcast,userId,username,participants,roomCode}){
  const pcs=useRef(new Map()),streams=useRef(new Map()),pending=useRef(new Map());
  const localRef=useRef(null),uid=useRef(userId),parts=useRef(participants||[]),sendRef=useRef(null);
  const signalSince=useRef(0),seen=useRef(new Set()),iceRef=useRef(FREE_ICE_SERVERS);
  const[joined,setJoined]=useState(false),[mic,setMic]=useState(false),[camera,setCamera]=useState(false);
  const[localStream,setLocalStream]=useState(null),[callError,setCallError]=useState(""),[iceReady,setIceReady]=useState(false);
  const[,force]=useState(0);

  useEffect(()=>{uid.current=userId},[userId]);
  useEffect(()=>{parts.current=participants||[]},[participants]);

  const closePeer=useCallback(id=>{
    try{pcs.current.get(id)?.close()}catch{}
    pcs.current.delete(id);streams.current.delete(id);pending.current.delete(id);force(n=>n+1);
  },[]);

  const sendSignal=useCallback(async(to,payload)=>{
    if(!roomCode)return false;
    try{
      const r=await fetch(`/api/rooms/${roomCode}/signals`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({to,...payload}),cache:"no-store"
      });
      return r.ok;
    }catch(e){console.warn("[call] signal send failed",e);return false;}
  },[roomCode]);
  useEffect(()=>{sendRef.current=sendSignal},[sendSignal]);

  const getPeer=useCallback(id=>{
    if(pcs.current.has(id))return pcs.current.get(id);
    const pc=new RTCPeerConnection({iceServers:iceRef.current});
    const stream=localRef.current;
    if(stream)stream.getTracks().forEach(t=>pc.addTrack(t,stream));
    pc.onicecandidate=e=>{if(e.candidate)sendRef.current?.(id,{candidate:e.candidate})};
    pc.onicecandidateerror=e=>console.warn("[call] ICE candidate error",e.errorCode,e.url,e.errorText);
    pc.ontrack=e=>{
      const s=e.streams?.[0];
      if(s){streams.current.set(id,s);force(n=>n+1)}
    };
    pc.onconnectionstatechange=()=>{
      console.debug("[call] connection",id,pc.connectionState);
      if(["failed","closed"].includes(pc.connectionState))closePeer(id);
      else if(pc.connectionState==="disconnected"){
        setTimeout(()=>{const x=pcs.current.get(id);if(x?.connectionState==="disconnected")closePeer(id)},5000);
      }
    };
    pc.oniceconnectionstatechange=()=>console.debug("[call] ICE",id,pc.iceConnectionState);
    pcs.current.set(id,pc);return pc;
  },[closePeer]);

  const flush=useCallback(async(id,pc)=>{
    const list=pending.current.get(id)||[];pending.current.delete(id);
    for(const c of list){try{await pc.addIceCandidate(c)}catch(e){console.warn("[call] ICE candidate add failed",e)}}
  },[]);

  const offer=useCallback(async id=>{
    if(!localRef.current||!joined||String(id)===String(uid.current)||String(uid.current)>String(id))return;
    const existing=pcs.current.get(id);
    if(existing&&existing.signalingState!=="stable")return;
    const pc=existing||getPeer(id);
    if(pc.signalingState!=="stable")return;
    try{
      const o=await pc.createOffer({offerToReceiveAudio:true,offerToReceiveVideo:true});
      await pc.setLocalDescription(o);
      await sendRef.current?.(id,{description:pc.localDescription});
    }catch(e){console.warn("[call] offer failed",e);closePeer(id)}
  },[getPeer,joined,closePeer]);

  const handleSignal=useCallback(async m=>{
    if(!joined||!m||String(m.to)!==String(uid.current)||String(m.from)===String(uid.current))return;
    if(m.id&&seen.current.has(m.id))return;if(m.id)seen.current.add(m.id);
    const id=String(m.from);const pc=getPeer(id);
    try{
      if(m.description){
        if(m.description.type==="offer"&&pc.signalingState!=="stable"){
          if(pc.signalingState==="have-local-offer")await pc.setLocalDescription({type:"rollback"});
          else {closePeer(id);return;}
        }
        await pc.setRemoteDescription(m.description);await flush(id,pc);
        if(m.description.type==="offer"){
          const a=await pc.createAnswer();await pc.setLocalDescription(a);
          await sendRef.current?.(id,{description:pc.localDescription});
        }
      }
      if(m.candidate){
        if(pc.remoteDescription)await pc.addIceCandidate(m.candidate);
        else{const list=pending.current.get(id)||[];list.push(m.candidate);pending.current.set(id,list)}
      }
    }catch(e){console.warn("[call] signal handling failed",e);closePeer(id)}
  },[joined,getPeer,closePeer,flush]);

  useEffect(()=>{
    if(!joined||!roomCode)return;
    let cancelled=false;
    const poll=async()=>{
      try{
        const r=await fetch(`/api/rooms/${roomCode}/signals?since=${signalSince.current}`,{cache:"no-store"});
        if(!r.ok)return;
        const d=await r.json();
        for(const s of d.signals||[]){signalSince.current=Math.max(signalSince.current,Number(s.at)||0);await handleSignal(s)}
      }catch(e){if(!cancelled)console.warn("[call] signal poll failed",e)}
    };
    poll();const t=setInterval(poll,300);return()=>{cancelled=true;clearInterval(t)};
  },[joined,roomCode,handleSignal]);

  useEffect(()=>{
    if(!joined||!iceReady)return;
    const run=()=>parts.current.filter(p=>String(p.id)!==String(uid.current)).forEach(p=>offer(String(p.id)));
    run();const t=setInterval(run,1500);return()=>clearInterval(t);
  },[joined,iceReady,participants,offer]);

  async function loadIce(){
    try{
      const r=await fetch("/api/webrtc/ice",{cache:"no-store"});
      const d=await r.json().catch(()=>({}));
      if(r.ok&&Array.isArray(d.iceServers)&&d.iceServers.length)iceRef.current=d.iceServers;
      else iceRef.current=FREE_ICE_SERVERS;
    }catch{iceRef.current=FREE_ICE_SERVERS}
    setIceReady(true);
  }

  async function toggleCall(){
    if(joined){
      pcs.current.forEach(pc=>{try{pc.close()}catch{}});pcs.current.clear();streams.current.clear();pending.current.clear();seen.current.clear();
      localRef.current?.getTracks().forEach(t=>t.stop());localRef.current=null;setLocalStream(null);setJoined(false);setIceReady(false);setMic(false);setCamera(false);setCallError("");force(n=>n+1);return;
    }
    try{
      setCallError("");
      if(!navigator.mediaDevices?.getUserMedia)throw new Error("Camera and microphone are unavailable in this browser.");
      await loadIce();
      const s=await navigator.mediaDevices.getUserMedia({audio:true,video:true});
      s.getAudioTracks().forEach(t=>t.enabled=false);s.getVideoTracks().forEach(t=>t.enabled=false);
      localRef.current=s;setLocalStream(s);setJoined(true);
    }catch(e){console.error("[call] start",e);setCallError(e?.name==="NotAllowedError"?"Camera/microphone permission was denied. Allow camera and microphone for this site and try again.":e?.message||"Unable to start the room call.")}
  }

  function toggle(kind){const s=localRef.current;if(!s)return;const tracks=kind==="mic"?s.getAudioTracks():s.getVideoTracks();const next=kind==="mic"?!mic:!camera;tracks.forEach(t=>t.enabled=next);kind==="mic"?setMic(next):setCamera(next)}

  useEffect(()=>()=>{pcs.current.forEach(pc=>{try{pc.close()}catch{}});localRef.current?.getTracks().forEach(t=>t.stop())},[]);
  const rem=Array.from(streams.current.entries());

  return <div className="space-y-4">
    <div className="flex items-center justify-between"><div><p className="eyebrow">LIVE CALL</p><h3 className="text-lg font-semibold mt-1">Talk while you watch</h3></div><span className={`status-pill ${joined?"status-live":""}`}>{joined?"Call connected":"Not in call"}</span></div>
    <p className="text-sm leading-6 text-white/50">Camera and microphone start muted. Turn them on when you are ready.</p>
    {callError&&<p className="text-xs text-red-300">{callError}</p>}
    {joined&&<div className="grid grid-cols-2 gap-3"><div className="call-tile"><video ref={el=>{if(el&&localStream)el.srcObject=localStream}} autoPlay muted playsInline/><div className="call-name">{username} <span>(You)</span></div></div>{rem.map(([id,stream])=><div key={id} className="call-tile"><video ref={el=>{if(el)el.srcObject=stream}} autoPlay playsInline/><div className="call-name">{participants.find(p=>String(p.id)===String(id))?.username||"Guest"}</div></div>)}</div>}
    <div className="flex gap-2 flex-wrap"><button onClick={()=>toggle("mic")} disabled={!joined} className="wt-button wt-button-ghost">{mic?"Mic on":"Mic off"}</button><button onClick={()=>toggle("camera")} disabled={!joined} className="wt-button wt-button-ghost">{camera?"Camera on":"Camera off"}</button><button onClick={toggleCall} className={`wt-button ${joined?"wt-button-danger":"wt-button-primary"}`}>{joined?"Leave call":"Join call"}</button></div>
  </div>;
}
