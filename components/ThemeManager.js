"use client";
import { useEffect } from "react";
export default function ThemeManager(){
 useEffect(()=>{
   const cached=localStorage.getItem("wt_theme");
   if(cached) document.documentElement.dataset.wtTheme=cached;
   fetch("/api/auth/profile").then(r=>r.ok?r.json():null).then(d=>{
     const theme=d?.user?.settings?.theme;
     if(theme){document.documentElement.dataset.wtTheme=theme;localStorage.setItem("wt_theme",theme);}
   }).catch(()=>{});
 },[]);
 return null;
}
