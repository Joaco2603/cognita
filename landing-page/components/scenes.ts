export type ViewKey =
  | "overview"
  | "context"
  | "access"
  | "agents"
  | "trim"
  | "pressure"
  | "compact";

export type Tone = "dim" | "warn" | "ok" | "bad" | "accent";

export interface Scene {
  cmd: string;
  view: ViewKey;
  /** Sidebar entry highlighted while this scene is shown. */
  nav: "Overview" | "Context" | "Access" | "Agents" | "Pressure";
  /** Short reply printed in the Claude Code conversation pane. */
  reply: { text: string; tone: Tone };
  /** Context percentage shown in the status line. */
  ctx: number;
  blurb: string;
}

export const SCENES: Scene[] = [
  {
    cmd: "/cognita",
    view: "overview",
    nav: "Overview",
    reply: { text: "Cognita opened · 1 risky action runs without asking", tone: "warn" },
    ctx: 9,
    blurb: "One pane with what is loaded, what the agent can do and what it is doing.",
  },
  {
    cmd: "/cognita context",
    view: "context",
    nav: "Context",
    reply: { text: "90,153 tokens loaded · 9,956 on 106 unused items", tone: "warn" },
    ctx: 9,
    blurb: "What fills the context window before you type, and what never gets used.",
  },
  {
    cmd: "/cognita access",
    view: "access",
    nav: "Access",
    reply: { text: "Reading .env runs without asking", tone: "bad" },
    ctx: 9,
    blurb: "Which risky actions run without asking you, and the rule behind each verdict.",
  },
  {
    cmd: "/cognita trim",
    view: "trim",
    nav: "Context",
    reply: { text: "Trim plan ready · frees ~1,665 tokens per session", tone: "ok" },
    ctx: 9,
    blurb: "The exact commands that free context, ordered by how much they save.",
  },
  {
    cmd: "/cognita agents",
    view: "agents",
    nav: "Agents",
    reply: { text: "2 subagents · 18.4k tokens", tone: "dim" },
    ctx: 11,
    blurb: "Subagents running in this session and the tokens each one spends.",
  },
  {
    cmd: "/cognita pressure",
    view: "pressure",
    nav: "Pressure",
    reply: { text: "Context pressure 64% · compact with focus", tone: "warn" },
    ctx: 41,
    blurb: "One pressure number: window use plus what splits the model's attention.",
  },
  {
    cmd: "/cognita compact",
    view: "compact",
    nav: "Pressure",
    reply: { text: "Compacted · 3 kept · 1 rewritten · 0 lost", tone: "ok" },
    ctx: 12,
    blurb: "Preview what a compaction keeps and drops, then check nothing tagged was lost.",
  },
];

export const NAV_ITEMS: Scene["nav"][] = ["Overview", "Context", "Access", "Agents", "Pressure"];
