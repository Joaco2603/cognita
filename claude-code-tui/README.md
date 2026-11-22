# Cognita

**See everything your Claude Code agent has access to.** Cognita is a Claude Code plugin that answers two questions inside the session you are already in:

1. **What has my agent loaded?** What fills the context window before you type: CLAUDE.md files, MCP servers, skills, system prompt sections. What it never uses, and the exact commands to trim it.
2. **What can my agent do?** Which tools it can call, which risky actions (git push, `rm -rf`, reading `.env` or SSH keys, writing outside the project) run **without asking you**, and the permission rules, hooks and plugins behind that.

It runs in your current terminal session: no separate app, no second Claude process, nothing sent anywhere.

## Install

From Claude Code (2.1.275 or later):

```bash
claude plugin marketplace add Joaco2603/cognita
claude plugin install cognita@cognita
```

Or, inside a session: `/plugin marketplace add Joaco2603/cognita`, then `/plugin install cognita@cognita`.

From a clone instead:

```bash
cd claude-code-tui
npm install
npm run build
npm run install:local   # copies the plugin to ~/.claude/skills/cognita
```

Start a new Claude Code session and run `/cognita`. If a session is already running, run `/reload-plugins` first.

## Usage

| Command | What it does |
| --- | --- |
| `/cognita` | Open the Cognita pane on the Overview |
| `/cognita access` | Print what the agent can reach and do, as Markdown |
| `/cognita access json` | The same as JSON, for scripts and CI |
| `/cognita report` | Print what this session loaded into context (estimated; add `full` for an exact count, `json` for scripts) |
| `/cognita trim` | A step-by-step plan, with commands, to shrink what loads before the first message |
| `/cognita history` | The loadout over the last 20 sessions in this project, with a sparkline |
| `/cognita context`, `/cognita access open`, `/cognita agents` | Open the pane on that view |
| `/cognita help` | List the subcommands |

`/inspector` is an alias of `/cognita`, kept for earlier versions.

### The pane

What the Overview looks like (numbers from a real session):

```
╭────────────────────────╮ WHAT YOUR AGENT SEES AND CAN DO                       ↻ Refresh
│ ◆ Cognita              │ ╭───────────────────────────────────────────────────────────────╮
│ what your agent sees   │ │ CONTEXT                                          details → 2  │
│                        │ │ ███▌················ 17% of 200k                              │
│ PROJECT                │ │ 33.7k tokens load before your first message                   │
│ my-app                 │ │ 3 instruction files · 9 MCP servers · 59 skills · 4 agent types│
│ claude-opus-5-5        │ │ ⚠ 1.7k tokens loaded but never used this session              │
│                        │ ╰───────────────────────────────────────────────────────────────╯
│ VIEWS                  │ ╭───────────────────────────────────────────────────────────────╮
│ ▸ 1 Overview           │ │ ACCESS                                           details → 3  │
│   2 Context            │ │ 512 tools · 9 MCP servers · 120 slash commands                │
│   3 Access             │ │ mode default · 38 permission rules · 14 hooks · 2 plugins     │
│   4 Agents             │ │ ⚠ Runs without asking: read .env secrets                      │
│                        │ ╰───────────────────────────────────────────────────────────────╯
│ everything at a glance │ ╭───────────────────────────────────────────────────────────────╮
│ Esc closes             │ │ AGENTS                                           details → 4  │
╰────────────────────────╯ │ No subagents in this session yet.                             │
                           ╰───────────────────────────────────────────────────────────────╯
                           1-4 switch views · r refresh · Esc close · /cognita help for commands
```

Every view has its key hints on its last line. The keys:

| Key | Where | Action |
| --- | --- | --- |
| `1` `2` `3` `4` | everywhere | Overview, Context, Access, Agents |
| `r` | everywhere | Refresh what the view shows |
| `Esc` | everywhere | Close the pane |
| `o` `m` `p` `s` `y` | Context | Subviews: Overview, Files, MCP, Skills, Prompt |
| `x` | Context | Exact count (asks Claude Code for a full breakdown) |
| `a` `t` `u` `k` | Access | Subviews: Actions, Tools, Rules, Hooks & plugins |

## What each view shows

### Overview

One screen with the three answers: how full the window is and how much of it is idle, how many tools and MCP servers the agent has and whether a risky action runs without asking, and how many subagents are working. Each card opens its view.

### Context: what the agent has loaded

- **Meter and categories.** How full the window is and what fills it: system prompt, tools, MCP tools, memory files, skills, messages.
- **Files.** Every CLAUDE.md and memory file loaded, with its token cost.
- **MCP.** Every MCP server: loaded and deferred tools, and how many calls this session made.
- **Skills.** Grouped by plugin or settings source, so one noisy plugin stands out.
- **Prompt.** Every section of the last composed system prompt, including the ones *other plugins* inject (`<plugin>:<name>` ids).
- **Loaded but unused.** MCP servers and skills that cost tokens but were never used this session.
- **Biggest levers.** The few changes that free the most context, such as `Disable plugin cloudflare (16 skills, none used): frees ~1,080 tokens`.
- **Since last session.** Each measurement is saved per project. The next session shows what changed (`MCP server linear: added, 3,000 tokens`), so context creep is caught early.

### Access: what the agent can do

- **Actions.** Cognita asks Claude Code's own permission system what it would answer for eight sample actions. **Nothing is run.** Each one reads `● runs without asking`, `◐ asks you first`, `○ blocked` or `· tool not available`, with the rule or reason behind it. Risky actions are marked `⚠`:

  | Action | Sample call |
  | --- | --- |
  | Run shell commands | `Bash: npm test` |
  | Edit files in the project | `Edit: <project>/README.md` |
  | Fetch web pages | `WebFetch: https://example.com` |
  | ⚠ Push to a git remote | `Bash: git push` |
  | ⚠ Delete files (rm -rf) | `Bash: rm -rf build` |
  | ⚠ Read .env secrets | `Read: <project>/.env` |
  | ⚠ Read SSH keys | `Read: ~/.ssh/id_rsa` |
  | ⚠ Write outside the project | `Write: ~/.bashrc` |

- **Tools.** Built-in tools, and MCP tools grouped by server.
- **Rules.** Allow, ask and deny rules by settings source (user, project, local, flag, policy), the permission mode and extra directories.
- **Hooks & plugins.** Hook commands from your settings by event (they run on your machine during the session), and the plugins that are enabled.
- **Warnings first.** `bypassPermissions` mode, risky actions that run without asking, and hook commands are flagged at the top.

Real output of `/cognita access` on a developer machine (trimmed):

```markdown
## What this agent can do

Model `claude-haiku-5-5` · Claude Code 2.1.330 · permission mode `default`

- **1 risky action(s) run without asking: read .env secrets.**
- **14 hook command(s) from your settings run on your machine during the session.**

### Actions (asked of the permission system, nothing was run)

| Action | Tool | Verdict | Why |
| --- | --- | --- | --- |
| Run shell commands | Bash | ◐ asks you first | This command requires approval |
| Fetch web pages | WebFetch | · tool not available |  |
| ⚠ Push to a git remote | Bash | ◐ asks you first | This command requires approval |
| ⚠ Read .env secrets | Read | ● runs without asking |  |
| ⚠ Read SSH keys | Read | ◐ asks you first | Claude requested permissions to read from C:\Users\me\.ssh\id_rsa, but you haven't granted it yet. |

### Tools · 512 (33 built-in, 479 from 9 MCP server(s))

| MCP server | Tools |
| --- | --- |
| claude_ai_Vercel | 280 |
| claude_ai_Notion | 77 |
```

The fix for that finding is one line in `.claude/settings.json`: `"permissions": { "deny": ["Read(./.env)"] }`. Run `/cognita access` again to confirm it reads `○ blocked`.

### Agents

The subagents of this session, running and finished, with their token use. Open one for its details, or start a new background agent in the project.

## Commands for scripts

- `/cognita report json` and `/cognita access json` print the same data as JSON.
- `/cognita trim` prints the exact command for each step, such as `claude plugin disable cloudflare --scope local` (this project only, with the undo command).
- Set `CLAUDE_INSPECTOR_BUDGET=30k` and the report says whether what loads before the first message fits.

## Status line and startup check

- **Status line.** `ctx 42% · $0.31 · +3.4k vs last` after every measurement (the last part only when the loadout changed).
- **Startup check.** When an interactive session starts, the loadout is measured in the background. A toast warns you if it grew by 2,000 tokens or more since the last session or went over your budget, and names the biggest cause.

## Configuration

| Variable | Default | Effect |
| --- | --- | --- |
| `CLAUDE_INSPECTOR_BUDGET` | none | Tokens that may load before the first message, such as `30000`, `30k` or `1.5M` |
| `CLAUDE_INSPECTOR_ALERT` | `2000` | Growth since the last session that raises a startup toast; `0` turns growth alerts off |
| `CLAUDE_INSPECTOR_STARTUP_CHECK` | on | Set it to `0` to skip the background measurement at session start |
| `CLAUDE_INSPECTOR_STATUSLINE` | on | Set it to `0` to keep the status line untouched |

## Privacy and safety

- Cognita reads; it never changes your settings. `/cognita trim` prints commands for you to run.
- The Access check asks the permission system what it *would* answer. No tool runs.
- Every observing hook only reads the event and passes it on (`next(event)`), inside `try/catch`, so a bug in Cognita can never block a tool call or a prompt.
- Nothing leaves your machine. Measurements are kept in the plugin's own store, per project, for the "since last session" comparison and the history.

## Development

```bash
npm install
npm run build      # tsc: src/*.ts -> hooks/*.js (the compiled hooks are committed)
npm test           # build + node unit tests + claude plugin test (UI tests)
npm run test:unit  # build + node unit tests only (no Claude Code needed)
npm run validate   # claude plugin validate .
```

| Path | Role |
| --- | --- |
| `src/register.ts` | The hooks module: the `/cognita` command, the pane, and the observe-only hooks |
| `src/loadout.ts` | Context analysis: groups the breakdown, joins it with usage, finds idle items, formats the reports |
| `src/access.ts` | Access analysis: sample actions, tools by server, rules, hooks, plugins, commands, warnings |
| `src/dashboard-view.ts` | The sidebar and the Overview |
| `src/context-view.ts`, `src/access-view.ts`, `src/agents-view.ts` | The Context, Access and Agents views |
| `src/theme.ts` | Colors and the key-hint line shared by the views |
| `tests/*.test.ts` | Pane tests run by `claude plugin test` with a mocked engine |
| `tests/*.test.mjs` | Node unit tests for the analysis, the path helpers and the local install |

## Limits and troubleshooting

- **Sample actions are samples.** A verdict is what the permission system answers for that exact call. A rule for a narrower command (`Bash(git push origin main)`) can still differ.
- **Session scope.** Usage counts start when the plugin loads and cover only this session. Agents started in other sessions do not appear.
- **"Unused" is a hint.** It means no calls in this session so far. Measure after real work, not right at startup.
- **The pane doesn't open.** Run `claude plugin validate <plugin folder>`, then `/reload-plugins`. Start `claude --debug` to see any hook errors. `/cognita report` and `/cognita access` work without the pane.
- **Two plugins answer `/inspector`.** An earlier version is installed as `workspace-dashboard`. `npm run install:local` removes it, or delete `~/.claude/skills/workspace-dashboard`.
- **Git Bash on Windows.** `claude -p "/cognita access"` can turn `/cognita` into a Windows path. Run it from PowerShell or set `MSYS_NO_PATHCONV=1`.
