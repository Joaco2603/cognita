"use client";

import { useState } from "react";

const VIDEOS = {
  en: { label: "English", src: "/media/cognita-demo-en.mp4" },
  es: { label: "Español", src: "/media/cognita-demo-es.mp4" },
} as const;

type Lang = keyof typeof VIDEOS;

const CHAPTERS = [
  { t: 0, label: "What Claude Code loads" },
  { t: 18, label: "The Overview" },
  { t: 38, label: "/cognita access catches .env" },
  { t: 58, label: "Deny rule added live" },
  { t: 78, label: "/cognita trim" },
];

export default function VideoShowcase() {
  const [lang, setLang] = useState<Lang>("en");

  const seek = (t: number) => {
    const v = document.getElementById("demo-video") as HTMLVideoElement | null;
    if (!v) return;
    v.currentTime = t;
    void v.play();
  };

  return (
    <div className="video-grid">
      <div className="video-frame">
        <div className="video-tabs" role="tablist">
          {(Object.keys(VIDEOS) as Lang[]).map((k) => (
            <button key={k} role="tab" aria-selected={lang === k} className={lang === k ? "active" : ""} onClick={() => setLang(k)}>
              {VIDEOS[k].label}
            </button>
          ))}
          <span className="video-meta">96 s · voiced · real session</span>
        </div>
        <video id="demo-video" key={lang} controls playsInline preload="metadata" poster="/media/cognita-demo.gif">
          <source src={VIDEOS[lang].src} type="video/mp4" />
        </video>
      </div>
      <ol className="chapters">
        {CHAPTERS.map((c) => (
          <li key={c.t}>
            <button onClick={() => seek(c.t)}>
              <span className="chap-t">
                {Math.floor(c.t / 60)}:{String(c.t % 60).padStart(2, "0")}
              </span>
              {c.label}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
