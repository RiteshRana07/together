"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STEPS = [
  ["01", "Bring a file, or bring a link", "Upload a movie from your collection, or paste a YouTube, Google Drive, or supported direct video link."],
  ["02", "Open a room, invite your people", "A room takes seconds and comes with a private link. Keep it invite-only and remove access whenever you want."],
  ["03", "Press play, and stay together", "Anyone can play, pause, or seek and the room follows — so a snack break pauses the film for everyone."],
];

const FEATURES = [
  ["Everyone on the same frame", "Playback is shared, so a pause is a pause for all of you. Late joiners drop into the current moment."],
  ["Talk over it, properly", "Live chat, floating reactions, and in-room voice and video keep the conversation beside the movie."],
  ["Private by default", "Invite-only rooms give you a private screening space with control over who can join."],
  ["Two ways to press play", "Use a movie from your library or a supported online source. Your room controls the shared playback state."],
  ["Any screen in the house", "Phones, tablets, laptops, and larger displays can join the same private room."],
];

function Reveal({ children, className = "", delay = 0 }) {
  return <div className={`wt-reveal ${className}`} style={{ "--reveal-delay": `${delay}ms` }}>{children}</div>;
}

export default function Home() {
  const [active, setActive] = useState("");

  useEffect(() => {
    const els = [...document.querySelectorAll(".wt-reveal")];
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("wt-reveal-in");
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    els.forEach((el) => observer.observe(el));

    const sections = [...document.querySelectorAll("section[id]")];
    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setActive(entry.target.id);
      });
    }, { threshold: 0.35 });
    sections.forEach((el) => sectionObserver.observe(el));

    return () => { observer.disconnect(); sectionObserver.disconnect(); };
  }, []);

  return (
    <main className="landing-page">
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <Link href="/" className="landing-brand"><span className="landing-brand-mark">V</span><span>WatchTogether</span></Link>
          <div className="landing-nav-links">
            <a href="#how" className={active === "how" ? "landing-nav-active" : ""}>How it works</a>
            <a href="#features" className={active === "features" ? "landing-nav-active" : ""}>Features</a>
            <a href="#questions" className={active === "questions" ? "landing-nav-active" : ""}>Questions</a>
          </div>
          <div className="landing-nav-actions">
            <Link href="/login">Sign in</Link>
            <Link href="/signup" className="landing-start">Get started</Link>
          </div>
        </div>
      </nav>

      <div className="landing-film-line" />

      <section className="landing-hero">
        <div className="landing-noise" />
        <div className="landing-hero-glow" />
        <div className="landing-wrap landing-hero-grid">
          <Reveal className="landing-hero-copy">
            <p className="landing-eyebrow">NOW SHOWING <span>/</span> YOUR LIVING ROOM</p>
            <h1>Watch movies.<br /><em>Argue</em> about<br /><em>them</em> in real time.</h1>
            <p className="landing-lead">Upload a movie or paste a YouTube link. Play, pause, seek — the whole room follows, so nobody has to text “wait, are you at the part where—”</p>
            <div className="landing-cta-row">
              <Link href="/signup" className="landing-cta landing-cta-red">Get started <span>→</span></Link>
              <a href="#how" className="landing-cta landing-cta-dark">See how it works</a>
            </div>
            <p className="landing-under-cta">Your uploads or a supported online link. Nothing to install.</p>
          </Reveal>

          <Reveal className="landing-hero-art" delay={130}>
            <div className="hero-film-window">
              <div className="hero-window-top"><span>●</span><span>●</span><span>●</span><label>Her laptop · Lisbon</label><b>R A M</b></div>
              <div className="hero-movie-scene"><div className="hero-sun" /><div className="hero-city"><i /><i /><i /><i /><i /><i /></div><span className="hero-time">01:12:01</span></div>
              <div className="hero-window-bottom"><span>CHAPTER 9 · THE ROOFTOP</span><span>01:12:01 / 02:08:31</span></div>
              <div className="hero-progress"><i /></div>
            </div>
            <div className="hero-chat-float"><span>R</span><b>that scene 😭</b></div>
            <div className="hero-sync-pill"><i /> IN SYNC</div>
          </Reveal>
        </div>

        <div className="landing-ticker" aria-label="WatchTogether features">
          <div className="landing-ticker-track">
            <span>YOUR UPLOADS OR ANY SUPPORTED VIDEO LINK</span><i />
            <span>INVITE-ONLY, REVOKE ANY TIME</span><i />
            <span>ADAPTIVE QUALITY UP TO 1080P</span><i />
            <span>LIVE CHAT AND FLOATING REACTIONS</span><i />
            <span>VOICE AND VIDEO CALLS IN-ROOM</span><i />
            <span>YOUR UPLOADS OR ANY SUPPORTED VIDEO LINK</span><i />
            <span>INVITE-ONLY, REVOKE ANY TIME</span><i />
            <span>ADAPTIVE QUALITY UP TO 1080P</span><i />
          </div>
        </div>
      </section>

      <section id="how" className="landing-section landing-how">
        <div className="landing-wrap">
          <Reveal><p className="landing-eyebrow">HOW IT WORKS <span>/</span></p></Reveal>
          <Reveal delay={70}><h2>Three steps. Two of them<br />are “click a button”.</h2></Reveal>
          <Reveal delay={120}><p className="landing-section-lead">No setup call, no browser extension, no shared screen that turns everyone into a 240p smudge.</p></Reveal>
          <div className="landing-step-grid">
            {STEPS.map(([num, title, body], i) => <Reveal key={num} delay={160 + i * 80} className="landing-step-card">
              <span className="landing-step-num">{num}</span><h3>{title}</h3><p>{body}</p>
            </Reveal>)}
          </div>
        </div>
      </section>

      <section id="features" className="landing-section landing-features">
        <div className="landing-wrap">
          <Reveal><p className="landing-eyebrow">FEATURES <span>/</span></p></Reveal>
          <Reveal delay={70}><h2>Built for the friend who<br />pauses every four minutes.</h2></Reveal>
          <Reveal delay={110}><p className="landing-section-lead">You know the one. Bathroom, snacks, a question about the actor’s other film. Now they can’t ruin the evening.</p></Reveal>
          <div className="landing-feature-grid">
            {FEATURES.map(([title, body], i) => <Reveal key={title} delay={i * 60} className={`landing-feature-card ${i < 2 ? "landing-feature-wide" : ""}`}><h3>{title}</h3><p>{body}</p></Reveal>)}
          </div>
        </div>
      </section>

      <section className="landing-section landing-proof">
        <div className="landing-wrap">
          <Reveal className="landing-proof-head"><p className="landing-eyebrow">THE WHOLE POINT <span>/</span></p><h2>Two sofas. Two<br />cities. One frame.</h2><p>Playback is shared state, not a countdown you both agree to start on three.</p></Reveal>
          <Reveal delay={120} className="landing-dual-screen">
            <div className="landing-device"><div className="landing-device-top"><span>● ● ●</span><b>Her laptop · Lisbon</b><small>R A M</small></div><div className="landing-device-scene"><div className="hero-sun"/><div className="hero-city"><i/><i/><i/><i/><i/><i/></div><span>01:12:11</span></div><div className="landing-device-chat"><b>M</b> wait he&apos;s been lying the whole film<br/><strong>YOU</strong> I TOLD you in chapter 2</div></div>
            <div className="landing-in-sync"><i/> IN SYNC</div>
            <div className="landing-device"><div className="landing-device-top"><span>● ● ●</span><b>His TV · Leeds</b><small>J A M</small></div><div className="landing-device-scene"><div className="hero-sun"/><div className="hero-city"><i/><i/><i/><i/><i/><i/></div><span>01:12:11</span></div><div className="landing-device-chat"><b>A</b> rewind ten seconds, I missed the line<br/><strong>YOU</strong> on it</div></div>
          </Reveal>
        </div>
      </section>

      <section id="questions" className="landing-section landing-questions">
        <div className="landing-wrap">
          <Reveal><p className="landing-eyebrow">QUESTIONS <span>/</span></p><h2>Good questions.<br />Better answers.</h2></Reveal>
          <div className="landing-faq-list">
            {[
              ["Will YouTube stay synchronized?", "Yes. Supported embedded players use the room's canonical playback state."],
              ["Can I use Google Drive?", "Yes. Use a Drive video that your account permits to be viewed and streamed."],
              ["Can I use any website?", "Only sources that expose a browser-playable stream or supported embeddable player can be synchronized."],
              ["Can people talk while watching?", "Yes. Rooms include chat, reactions, and an optional voice/video call."],
            ].map(([q, a], i) => <Reveal key={q} delay={i * 50}><details className="landing-faq"><summary>{q}<span>+</span></summary><p>{a}</p></details></Reveal>)}
          </div>
        </div>
      </section>

      <footer className="landing-footer"><div className="landing-wrap"><span>WatchTogether · private rooms for people who want to watch together.</span><Link href="/signup">Start a screening →</Link></div></footer>
    </main>
  );
}
