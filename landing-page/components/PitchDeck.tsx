"use client";

import { useCallback, useEffect, useState } from "react";

type Slide = { kicker: string; render: () => React.ReactNode };

const REPO = "https://github.com/Joaco2603/cognita";

const SLIDES: Slide[] = [
  {
    kicker: "Cognita",
    render: () => (
      <div className="pd-center">
        <img src="/icon.png" alt="" width={72} height={72} className="pd-logo" />
        <h1>
          See everything your <span className="grad">Claude Code agent</span> has access to.
        </h1>
        <p className="pd-sub">A Claude Code plugin · Dojo AI Hackathon · Track 01: Build for Builders</p>
      </div>
    ),
  },
  {
    kicker: "The problem",
    render: () => (
      <>
        <h2>Your agent is a black box you gave the keys to.</h2>
        <ul className="pd-list">
          <li>
            <b>Context fills up before you type.</b> CLAUDE.md files, MCP servers with hundreds of tools, plugin
            skills. Sessions start at 35k tokens and nobody knows why.
          </li>
          <li>
            <b>Permissions pile up for months.</b> Does <code>git push</code> or reading <code>.env</code> run
            without asking? You only find out when it happens.
          </li>
          <li>
            <b>Subagents run out of sight.</b> Which ones are working, and what they spend.
          </li>
        </ul>
      </>
    ),
  },
  {
    kicker: "The solution",
    render: () => (
      <>
        <h2>One pane, inside the session you are already in.</h2>
        <div className="pd-grid">
          {[
            ["What it has loaded", "/cognita context"],
            ["What it can do", "/cognita access"],
            ["What it is doing", "/cognita agents"],
            ["How hard context works", "/cognita pressure"],
          ].map(([t, c]) => (
            <div key={c} className="pd-card">
              <h3>{t}</h3>
              <code>{c}</code>
            </div>
          ))}
        </div>
        <p className="pd-note">Not just data: every view ends with the exact command that fixes what it found.</p>
      </>
    ),
  },
  {
    kicker: "Proof",
    render: () => (
      <>
        <h2>Found in real Claude Code sessions.</h2>
        <div className="pd-stats">
          <div>
            <span className="pd-n">.env</span>
            <p>Reading .env ran without asking until one deny rule blocked it.</p>
          </div>
          <div>
            <span className="pd-n">~1,080</span>
            <p>tokens every session from a plugin with 16 skills that was never used.</p>
          </div>
          <div>
            <span className="pd-n">−2,644</span>
            <p>tokens before the first message by holding unused MCP servers.</p>
          </div>
        </div>
      </>
    ),
  },
  {
    kicker: "Who pays",
    render: () => (
      <>
        <h2>Three buyers, one install.</h2>
        <div className="pd-grid three">
          <div className="pd-card">
            <h3>Developers</h3>
            <p>Know why a session starts at 35k tokens and which plugin or MCP server to turn off.</p>
          </div>
          <div className="pd-card">
            <h3>Teams and leads</h3>
            <p>
              <code>.cognita.json</code> sets the token budget and minimum verdict per action.{" "}
              <code>/cognita report json</code> fits into CI.
            </p>
          </div>
          <div className="pd-card">
            <h3>Plugin and MCP authors</h3>
            <p>See what your plugin costs in context and which sections it injects into the system prompt.</p>
          </div>
        </div>
      </>
    ),
  },
  {
    kicker: "Business model",
    render: () => (
      <>
        <h2>Sold on Dojo Marketplace.</h2>
        <ul className="pd-list">
          <li>
            <b>Free core:</b> the four views, install in 2 commands.
          </li>
          <li>
            <b>Team value:</b> repo policy (<code>.cognita.json</code>), CI reports, supply-chain and cost views.
          </li>
          <li>
            <b>Distribution:</b> every Claude Code user is a potential user. It lives where they already work.
          </li>
        </ul>
      </>
    ),
  },
  {
    kicker: "Built with AI",
    render: () => (
      <>
        <h2>Built with Claude Code, tested in real sessions.</h2>
        <ul className="pd-list">
          <li>Claude Code wrote most of the TypeScript, tests and docs. The team set direction and reviewed each change.</li>
          <li>
            Every feature checked against a real session. Those runs caught real bugs: deferred tools counted inside the
            window (163%).
          </li>
          <li>Team Repository Syndicate: Joaquín Pappa, Jeffry VF, Andrés Calvo.</li>
        </ul>
      </>
    ),
  },
  {
    kicker: "Try it",
    render: () => (
      <div className="pd-center">
        <h2>Install in 2 commands.</h2>
        <pre className="pd-code">
          <span className="t-dim">$</span> claude plugin marketplace add Joaco2603/cognita{"\n"}
          <span className="t-dim">$</span> claude plugin install cognita@cognita
        </pre>
        <p className="pd-sub">
          Then run <code>/cognita</code> in a new session.
        </p>
        <div className="hero-ctas">
          <a href="/" className="btn primary">
            Live demo
          </a>
          <a href={REPO} target="_blank" rel="noreferrer" className="btn">
            GitHub ↗
          </a>
        </div>
      </div>
    ),
  },
];

export default function PitchDeck() {
  const [i, setI] = useState(0);
  const go = useCallback((n: number) => setI(Math.max(0, Math.min(SLIDES.length - 1, n))), []);

  useEffect(() => {
    const readHash = () => {
      const n = parseInt(window.location.hash.slice(1), 10);
      if (n > 0) go(n - 1);
    };
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, [go]);

  useEffect(() => {
    history.replaceState(null, "", `#${i + 1}`);
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        go(i + 1);
      } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) {
        e.preventDefault();
        go(i - 1);
      } else if (e.key === "Home") go(0);
      else if (e.key === "End") go(SLIDES.length - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, go]);

  const slide = SLIDES[i];

  return (
    <div className="pd">
      <header className="pd-top">
        <a href="/" className="brand">
          <img src="/icon.png" alt="" width={22} height={22} /> Cognita
        </a>
        <span className="pd-kicker">{slide.kicker}</span>
      </header>

      <section key={i} className="pd-slide" aria-live="polite">
        {slide.render()}
      </section>

      <footer className="pd-bottom">
        <button onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous slide">
          ←
        </button>
        <div className="pd-dots">
          {SLIDES.map((s, n) => (
            <button
              key={s.kicker}
              className={n === i ? "on" : ""}
              onClick={() => go(n)}
              aria-label={`Go to slide ${n + 1}: ${s.kicker}`}
            />
          ))}
        </div>
        <button onClick={() => go(i + 1)} disabled={i === SLIDES.length - 1} aria-label="Next slide">
          →
        </button>
        <span className="pd-count">
          {i + 1} / {SLIDES.length}
        </span>
      </footer>
    </div>
  );
}
