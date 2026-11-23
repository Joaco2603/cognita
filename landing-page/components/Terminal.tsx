"use client";

import { KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { NAV_ITEMS, SCENES, Tone } from "./scenes";
import { View } from "./Views";

type Phase = "typing" | "running" | "shown";

interface HistoryItem {
  id: number;
  cmd: string;
  reply: { text: string; tone: Tone };
}

const TYPE_MS = 55;
const RUN_MS = 650;
const HOLD_MS = 6200;

function Mascot() {
  // A small block creature drawn with a pixel grid.
  const rows = ["0111110", "1101011", "1111111", "0111110", "0101010"];
  return (
    <div className="mascot" aria-hidden>
      {rows.join("").split("").map((c, i) => (
        <span key={i} className={c === "1" ? "on" : ""} />
      ))}
    </div>
  );
}

export default function Terminal() {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("typing");
  const [typed, setTyped] = useState("");
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [auto, setAuto] = useState(true);
  const [runKey, setRunKey] = useState(0);
  const [cpu, setCpu] = useState(26);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const idSeq = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };

  const play = useCallback((idx: number, keepAuto: boolean) => {
    clearTimers();
    const scene = SCENES[idx];
    setPhase("typing");
    setTyped("");
    for (let i = 1; i <= scene.cmd.length; i++) {
      later(() => setTyped(scene.cmd.slice(0, i)), i * TYPE_MS);
    }
    const typedAt = scene.cmd.length * TYPE_MS + 250;
    later(() => setPhase("running"), typedAt);
    later(() => {
      setSceneIdx(idx);
      setRunKey((k) => k + 1);
      setPhase("shown");
      setTyped("");
      setHistory((h) => [...h.slice(-5), { id: idSeq.current++, cmd: scene.cmd, reply: scene.reply }]);
      if (keepAuto) later(() => play((idx + 1) % SCENES.length, true), HOLD_MS);
    }, typedAt + RUN_MS);
  }, []);

  useEffect(() => {
    play(0, true);
    return clearTimers;
  }, [play]);

  useEffect(() => {
    const t = setInterval(() => setCpu(18 + Math.round(Math.random() * 20)), 1500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [history, phase]);

  const pick = (idx: number) => {
    setAuto(false);
    play(idx, false);
  };

  const toggleAuto = () => {
    if (auto) {
      clearTimers();
      setAuto(false);
      if (phase !== "shown") setPhase("shown");
      setTyped("");
    } else {
      setAuto(true);
      play((sceneIdx + 1) % SCENES.length, true);
    }
  };

  const submit = () => {
    const raw = input.trim();
    setInput("");
    if (!raw) return;
    const cmd = raw.toLowerCase().replace(/\s+/g, " ");
    if (cmd === "/clear") {
      setHistory([]);
      return;
    }
    const idx = SCENES.findIndex((s) => s.cmd === cmd);
    if (idx >= 0) {
      clearTimers();
      setAuto(false);
      setTyped("");
      setPhase("running");
      later(() => {
        setSceneIdx(idx);
        setRunKey((k) => k + 1);
        setPhase("shown");
        setHistory((h) => [...h.slice(-5), { id: idSeq.current++, cmd: SCENES[idx].cmd, reply: SCENES[idx].reply }]);
      }, RUN_MS);
      return;
    }
    setHistory((h) => [
      ...h.slice(-5),
      {
        id: idSeq.current++,
        cmd: raw,
        reply: { text: `Try: ${SCENES.map((s) => s.cmd).join(", ")}`, tone: "dim" },
      },
    ]);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") submit();
  };

  const onFocus = () => {
    if (auto) {
      clearTimers();
      setAuto(false);
      setTyped("");
      if (phase !== "shown") setPhase("shown");
    }
  };

  const scene = SCENES[sceneIdx];
  const promptValue = phase === "typing" && auto ? typed : input;

  return (
    <div className="terminal-wrap">
      <div className="tui" role="region" aria-label="Interactive Cognita demo inside Claude Code">
        <div className="tui-chrome">
          <span className="dot red" />
          <span className="dot yellow" />
          <span className="dot green" />
        </div>
        <div className="tui-tmux">
          <span className="seg">315</span>
          <span className="seg">1 2.1.330</span>
          <span className="spacer" />
          <span className="seg alt">! claude/main</span>
          <span className="seg cpu">CPU {String(cpu).padStart(3, " ")}%</span>
          <span className="seg ram">RAM 14GiB/24GiB</span>
        </div>

        <div className="tui-body">
          <div className="tui-left" ref={logRef}>
            <div className="cc-header">
              <Mascot />
              <div>
                <div>
                  <b>Claude Code</b> <span className="t-dim">v2.1.330</span>
                </div>
                <div className="t-dim">Haiku 5.5 · Claude Pro</div>
                <div className="t-dim">~/projects/my-app</div>
              </div>
            </div>
            {history.map((h) => (
              <div key={h.id} className="turn">
                <div className="turn-cmd">❯ {h.cmd}</div>
                <div className={`turn-reply t-${h.reply.tone}`}>⎿ {h.reply.text}</div>
              </div>
            ))}
            {phase === "running" && (
              <div className="turn">
                <div className="turn-reply t-accent">
                  <span className="spin">✻</span> Measuring…
                </div>
              </div>
            )}
          </div>

          <div className="tui-right">
            <div className="cg-side">
              <div className="t-accent b">◆ Cognita</div>
              <div className="t-dim">what your agent sees</div>
              <div className="side-h">PROJECT</div>
              <div>my-app</div>
              <div className="t-dim">claude-haiku-5…</div>
              <div className="side-h">VIEWS</div>
              {NAV_ITEMS.map((n, i) => {
                const target = SCENES.findIndex((s) => s.nav === n);
                return (
                  <button
                    key={n}
                    className={`side-item ${scene.nav === n ? "active" : ""}`}
                    onClick={() => pick(target)}
                  >
                    <span className="t-accent">{i + 1}:</span> {scene.nav === n ? "▸" : " "} {n}
                  </button>
                );
              })}
              <div className="side-foot t-dim">Esc closes</div>
            </div>
            <div className="cg-main">
              <div key={runKey} className={`view ${phase === "running" ? "is-running" : ""}`}>
                <View view={scene.view} />
              </div>
            </div>
          </div>
        </div>

        <label className="tui-prompt">
          <span className="t-dim">❯</span>
          <input
            value={promptValue}
            readOnly={auto && phase === "typing"}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            onFocus={onFocus}
            placeholder={auto ? "" : "type /cognita access and press Enter"}
            aria-label="Type a Cognita command"
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <div className="tui-status">
          <div className="t-warn">
            ⚠ cognita: ctx {scene.ctx}% · $0.01 · +289 vs last
          </div>
          <div className="t-accent">
            ▸▸ auto mode on <span className="t-dim">(shift+tab to cycle)</span>
          </div>
        </div>
      </div>

      <div className="cmd-bar">
        <button className={`chip play ${auto ? "on" : ""}`} onClick={toggleAuto}>
          {auto ? "❚❚ Pause tour" : "▶ Play tour"}
        </button>
        {SCENES.map((s, i) => (
          <button key={s.cmd} className={`chip ${i === sceneIdx ? "active" : ""}`} onClick={() => pick(i)}>
            {s.cmd}
          </button>
        ))}
      </div>
      <p className="cmd-blurb" key={sceneIdx}>
        <span className="t-accent">{scene.cmd}</span> · {scene.blurb}
      </p>
    </div>
  );
}
