"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
const LINKS=[{href:"/dashboard",label:"Home"},{href:"/library",label:"My Library"},{href:"/rooms",label:"Watch Rooms"}];
export default function Nav({username,avatarUrl}){
 const pathname=usePathname(),router=useRouter();
 const [open,setOpen]=useState(false),[account,setAccount]=useState({username:username||"",email:"",avatarUrl:avatarUrl||""}),[unread,setUnread]=useState(0);
 useEffect(()=>{if(!username||!avatarUrl)fetch("/api/auth/profile").then(r=>r.ok?r.json():null).then(d=>d?.user&&setAccount({username:d.user.username,email:d.user.email,avatarUrl:d.user.avatar_url||""})).catch(()=>{});},[username,avatarUrl]);
 useEffect(()=>{let alive=true; const load=()=>fetch("/api/notifications").then(r=>r.ok?r.json():null).then(d=>{if(alive&&d)setUnread(d.unread||0)}).catch(()=>{}); load(); const t=setInterval(load,15000); return()=>{alive=false;clearInterval(t)}},[]);
 const currentName=account.username||username||"U"; const initial=currentName.slice(0,1).toUpperCase();
 return <nav className="wt-nav"><div className="wt-shell wt-nav-inner"><div className="flex items-center gap-10"><Link href="/dashboard" className="brand"><span className="brand-mark">V</span><span>WatchTogether</span></Link><div className="nav-links">{LINKS.map(l=><Link key={l.href} href={l.href} className={`nav-link ${pathname===l.href||pathname.startsWith(l.href+"/")?"nav-link-active":""}`}>{l.label}</Link>)}</div></div><div className="nav-actions">
 <Link href="/notifications" className={`icon-button nav-bell ${pathname==="/notifications"?"nav-bell-active":""}`} title="Notifications" aria-label="Notifications">♧{unread>0&&<span className="nav-notification-count">{unread>9?"9+":unread}</span>}</Link>
 <div className="relative"><button onClick={()=>setOpen(v=>!v)} className="avatar overflow-hidden" title={currentName}>{account.avatarUrl?<img src={account.avatarUrl} alt="" className="w-full h-full object-cover"/>:initial}</button>{open&&<div className="account-menu"><div className="px-3 py-2 border-b border-white/[.07]"><p className="text-xs font-semibold">{currentName||"Guest"}</p><p className="text-[10px] text-white/35 truncate">{account.email||"Account"}</p></div><Link href="/settings" onClick={()=>setOpen(false)} className="account-menu-item">⚙ <span>Account settings</span></Link><button onClick={async()=>{await fetch("/api/auth/logout",{method:"POST"});router.push("/")}} className="account-menu-item">↪ <span>Sign out</span></button></div>}</div></div></div></nav>
}
