"use client";

import { Children, ReactNode, useEffect, useState } from "react";
import type { ViewKey } from "./scenes";

/** Reveals each child line one after another. */
function Stagger({ children, step = 70 }: { children: ReactNode; step?: number }) {
  return (
    <>
      {Children.toArray(children).map((child, i) => (
        <div key={i} className="ln" style={{ animationDelay: `${i * step}ms` }}>
          {child}
        </div>
      ))}
    </>
  );
}

function CountUp({ to, ms = 900 }: { to: number; ms?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return <>{v.toLocaleString("en-US")}</>;
}

function Bar({ pct, tone = "accent", width = 22 }: { pct: number; tone?: string; width?: number }) {
  return (
    <span className="bar" style={{ width: `${width}ch` }}>
      <span className={`bar-fill t-${tone}`} style={{ ["--w" as string]: `${pct}%` }} />
    </span>
  );
}

function Row({ label, value, extra, tone }: { label: ReactNode; value: ReactNode; extra?: ReactNode; tone?: string }) {
  return (
    <span className={`row ${tone ? `t-${tone}` : ""}`}>
      <span className="row-label">{label}</span>
      <span className="row-value">{value}</span>
      {extra !== undefined && <span className="row-extra">{extra}</span>}
    </span>
  );
}

function H({ children }: { children: ReactNode }) {
  return <span className="h">{children}</span>;
}

function Overview() {
  return (
    <Stagger>
      <span>
        <span className="t-accent b">CONTEXT LOADOUT</span> claude-haiku-5-5
      </span>
      <span>
        <Bar pct={9} /> <span className="t-accent">9%</span>
      </span>
      <span className="t-dim">
        <CountUp to={90153} /> / 1,000,000 tokens · 877k free
      </span>
      <H>WHAT IT CAN DO</H>
      <span className="t-bad">⚠ 1 risky action runs without asking: read .env secrets</span>
      <span className="t-warn">14 hook commands from your settings run on your machine</span>
      <H>WHAT IT IS DOING</H>
      <span>2 subagents running · 18.4k tokens</span>
      <H>PRESSURE</H>
      <span>
        <Bar pct={6} tone="ok" width={14} /> <span className="t-ok">6% · ok</span>
      </span>
      <H>BIGGEST LEVER</H>
      <Row tone="warn" label="Trim …/.claude/CLAUDE.md (loads every turn)" value="-28k" />
    </Stagger>
  );
}

function Context() {
  const rows: [string, string, string][] = [
    ["Messages", "31k", "3%"],
    ["Memory files", "28k", "3%"],
    ["System tools", "14k", "1%"],
    ["Skills", "10.0k", "<1%"],
    ["System prompt", "3.7k", "<1%"],
    ["MCP server instructions", "2.5k", "<1%"],
    ["Custom agents", "874", "<1%"],
  ];
  return (
    <Stagger step={55}>
      <span>
        <span className="t-accent b">CONTEXT LOADOUT</span> claude-haiku-5-5
      </span>
      <span>
        <Bar pct={9} /> <span className="t-accent">9%</span>
      </span>
      <H>WHAT FILLS THE WINDOW</H>
      {rows.map(([l, v, p]) => (
        <Row key={l} label={l} value={v} extra={p} />
      ))}
      <span className="t-dim">+ 417k deferred (outside the window until loaded)</span>
      <H>LOADED BUT UNUSED THIS SESSION</H>
      <span className="t-warn">9,956 tokens on 106 unused item(s)</span>
      <Row tone="warn" label="skill · dataviz" value="482" />
      <Row tone="warn" label="skill · code-review" value="405" />
      <Row tone="warn" label="skill · claude-api" value="390" />
    </Stagger>
  );
}

function Access() {
  const rows: [string, string, string, string][] = [
    ["Push to a git remote", "Bash", "◐ asks you first", "warn"],
    ["Read .env secrets", "Read", "● runs without asking", "bad"],
    ["Read SSH keys", "Read", "◐ asks you first", "warn"],
    ["rm -rf in the project", "Bash", "○ blocked by deny rule", "ok"],
    ["Write outside the project", "Edit", "◐ asks you first", "warn"],
  ];
  return (
    <Stagger step={90}>
      <span>
        <span className="t-accent b">WHAT THIS AGENT CAN DO</span>{" "}
        <span className="t-dim">mode default</span>
      </span>
      <span className="t-bad b">1 risky action runs without asking: read .env secrets.</span>
      <span className="t-warn">14 hook commands from your settings run on your machine.</span>
      <H>ACTION · TOOL · VERDICT</H>
      {rows.map(([a, t, v, tone]) => (
        <span key={a} className="row">
          <span className="row-label">⚠ {a}</span>
          <span className="row-tool t-dim">{t}</span>
          <span className={`row-value t-${tone}`}>{v}</span>
        </span>
      ))}
      <H>FIX</H>
      <span className="t-dim">Add a deny rule:</span>
      <span className="code">&quot;deny&quot;: [&quot;Read(./.env*)&quot;]</span>
    </Stagger>
  );
}

function Trim() {
  return (
    <Stagger step={110}>
      <span>
        <span className="t-accent b">TRIM PLAN</span>{" "}
        <span className="t-dim">
          loaded before any message: <CountUp to={33710} /> tokens
        </span>
      </span>
      <H>1 · DISABLE PLUGIN cloudflare</H>
      <span className="t-dim">16 skills, none used · frees ~1,080</span>
      <span className="code">claude plugin disable cloudflare --scope local</span>
      <H>2 · DISABLE MCP claude_ai_Claude_Docs</H>
      <span className="t-dim">3 loaded tools, no calls · frees ~585 (total ~1,665)</span>
      <span className="code">claude mcp disable claude_ai_Claude_Docs</span>
      <H>3 · TRIM …/.claude/CLAUDE.md</H>
      <span className="t-dim">loads every turn · up to -28k</span>
      <span className="t-ok">✓ each step is one command, nothing else changes</span>
    </Stagger>
  );
}

function Agents() {
  return (
    <Stagger step={110}>
      <span>
        <span className="t-accent b">SUBAGENTS</span> <span className="t-dim">this session</span>
      </span>
      <H>RUNNING</H>
      <Row
        label={
          <>
            <span className="spin">⠋</span> Explore · haiku
          </>
        }
        value={
          <>
            <CountUp to={12140} ms={2400} /> tok
          </>
        }
      />
      <span>
        <Bar pct={58} tone="warn" width={18} />
      </span>
      <H>DONE</H>
      <Row tone="ok" label="✓ Plan · opus" value="6,302 tok" />
      <span>
        <Bar pct={100} tone="ok" width={18} />
      </span>
      <H>TOTAL</H>
      <Row label="2 subagents" value="18.4k tokens" extra="$0.04" />
    </Stagger>
  );
}

function Pressure() {
  const rows: [string, string, string][] = [
    ["Open plan items", "7", "28 / 40"],
    ["Words in the open plan", "1,240", "14 / 20"],
    ["Words in your last 3 prompts", "610", "9 / 20"],
    ["Prompts since last compaction", "38", "13 / 20"],
  ];
  return (
    <Stagger step={80}>
      <span>
        <span className="t-accent b">CONTEXT PRESSURE</span>{" "}
        <span className="big t-warn">
          <CountUp to={64} />%
        </span>
      </span>
      <span>
        <Bar pct={64} tone="warn" width={30} />
      </span>
      <span className="t-dim">window 41% (410,882 of 1,000,000) + attention 64 / 100 (estimate)</span>
      <H>ATTENTION SIGNAL · VALUE · POINTS</H>
      {rows.map(([l, v, p]) => (
        <Row key={l} label={l} value={v} extra={p} />
      ))}
      <H>ONE STEP THAT RELIEVES IT</H>
      <span className="t-ok">→ /cognita compact (focus built from your goal and plan)</span>
    </Stagger>
  );
}

function Compact() {
  return (
    <Stagger step={95}>
      <span>
        <span className="t-accent b">COMPACTION PREVIEW</span>{" "}
        <span className="t-dim">focus: ship the pressure view</span>
      </span>
      <H>KEEPS</H>
      <span className="t-ok">✓ &lt;decision&gt; retry compaction on a timer</span>
      <span className="t-ok">✓ &lt;constraint&gt; never read .env</span>
      <span className="t-ok">✓ open plan · 7 items</span>
      <H>DROPS</H>
      <span className="t-bad">✗ 31 tool results already applied</span>
      <span className="t-bad">✗ exploration of claude-code-tui/ (summarized)</span>
      <H>AFTER COMPACTION</H>
      <Row label="window" value={<span className="t-ok">41% → 12%</span>} />
      <Row label="tagged items" value={<span className="t-ok">3 kept · 1 rewritten · 0 lost</span>} />
    </Stagger>
  );
}

export function View({ view }: { view: ViewKey }) {
  switch (view) {
    case "overview":
      return <Overview />;
    case "context":
      return <Context />;
    case "access":
      return <Access />;
    case "trim":
      return <Trim />;
    case "agents":
      return <Agents />;
    case "pressure":
      return <Pressure />;
    case "compact":
      return <Compact />;
  }
}
