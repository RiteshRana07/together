"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const REVEAL_SELECTORS = [
  ".wt-card",
  ".cin-section",
  ".cin-stat",
  ".cin-step",
  ".cin-room-row",
  ".cin-private-card",
  ".cin-next-card",
  ".settings-layout",
  ".notice-card",
  ".history-card",
  ".history-item",
  ".settings-content",
  ".settings-sidebar",
  ".theme-card",
  ".source-picker",
  ".source-tab",
  ".wt-modal",
  ".call-tile",
];

export default function PageMotion({ children }) {
  const pathname = usePathname();
  const frameRef = useRef(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    frame.classList.remove("wt-route-ready");
    void frame.offsetWidth;
    requestAnimationFrame(() => frame.classList.add("wt-route-ready"));

    const nodes = REVEAL_SELECTORS.flatMap((selector) =>
      Array.from(frame.querySelectorAll(selector))
    );

    const unique = Array.from(new Set(nodes));
    unique.forEach((node, index) => {
      node.classList.add("wt-motion-item");
      node.style.setProperty("--motion-delay", `${Math.min(index * 45, 360)}ms`);
    });

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      unique.forEach((node) => node.classList.add("wt-motion-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("wt-motion-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -7% 0px" }
    );

    unique.forEach((node) => observer.observe(node));

    return () => observer.disconnect();
  }, [pathname]);

  return (
    <div ref={frameRef} key={pathname} className="wt-route-frame">
      <div className="wt-route-wash" aria-hidden="true" />
      {children}
    </div>
  );
}
