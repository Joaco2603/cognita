# Cognita

[![CI](https://github.com/Joaco2603/cognita/actions/workflows/ci.yml/badge.svg)](https://github.com/Joaco2603/cognita/actions/workflows/ci.yml) · [Changelog](./CHANGELOG.md)

**See everything your Claude Code agent has access to.** Cognita is a Claude Code plugin that answers two questions inside the session you are already in:

1. **What has my agent loaded?** What fills the context window before you type: CLAUDE.md files, MCP servers, skills, system prompt sections. What it never uses, and the exact commands to trim it.
2. **What can my agent do?** Which tools it can call, which risky actions (git push, `rm -rf`, reading `.env` or SSH keys, writing outside the project) run **without asking you**, and the permission rules, hooks and plugins behind that.
3. **Is my context under pressure?** A full window, a long plan or long instructions split the model's attention. Cognita turns that into one percentage and the step that relieves it: compact with the right focus, save decisions to Engram, or hand plan items to subagents.

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
| `/cognita supply` | List every hook and MCP server that runs code here and whether it is pinned to a version (add `json` for scripts) |
| `/cognita report` | Print what this session loaded into context (estimated; add `full` for an exact count, `json` for scripts) |
| `/cognita trim` | A step-by-step plan, with commands, to shrink what loads before the first message |
| `/cognita history` | The loadout over the last 20 sessions in this project, with a sparkline |
| `/cognita cost` | What sessions cost in dollars in this project: total, per day, per session (`json` for scripts) |
| `/cognita pressure` | Context pressure (window plus an attention estimate) and the steps that relieve it; add `json` for scripts |
| `/cognita compact` | Compact now, keeping the goal and the open plan |
| `/cognita save` | Send the prompt that saves the goal, decisions and plan to Engram (needs an Engram MCP server) |
| `/cognita split` | Send the prompt that hands the pending plan items to subagents |
| `/cognita context`, `/cognita access open`, `/cognita agents` | Open the pane on that view |
| `/cognita hold <server>` | Keep an MCP server off from the next session in this project; with no name, list what is held and suggest idle servers |
| `/cognita connect [server]` | Bring a held server back for this session; with no name, every server held now |
| `/cognita release <server\|all>` | Stop holding it, so it loads at every start again |
| `/cognita doctor` | Which Claude Code engine APIs Cognita needs, which this version lacks, and the Claude Code version |
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
| `c` | Context, MCP | Connect the servers held in this session |
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
- **Lazy MCP.** `/cognita hold context7` keeps an MCP server off from the next session in this project, and `/cognita connect context7` brings it back any time, mid-session, with no restart. The MCP view has the same buttons, and after a few sessions of a server being loaded and never called, Cognita suggests holding it. Holding is per project, never disconnects a server in the current session, and falls back to connecting everything if anything goes wrong.
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

- **Your own actions.** Actions declared in [`.cognita.json`](#cognitajson-the-team-policy), such as `terraform apply` or `kubectl delete`, are asked of the permission system the same way.
- **Tools.** Built-in tools, and MCP tools grouped by server. Every loaded MCP tool is also asked, with an empty input and nothing run, and each server shows how many of its tools run without asking (capped at 300 tools, best effort).
- **Too broad.** Allow rules that grant far more than one command are flagged with the settings source that defines them: `Bash`, `Bash(*)`, `Bash(:*)`, `Write`/`Edit` with no pattern, `*` or `**`, and whole-server rules (`mcp__server`, `mcp__server__*`).
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

### Pressure: how hard the context is working

The Overview's PRESSURE card and `/cognita pressure` combine two things:

```
window    = context tokens / context window                     measured by Claude Code
attention = plan + plan words + prompt words + turns, max 100    estimate
  plan         = 4 points per open plan item, max 40
  plan words   = words in the open items / 20, max 20
  prompt words = words in your last 3 prompts / 40, max 20
  turns        = 1 point per prompt after the 5th since the last compaction, max 20
pressure  = window + ½ × attention × (1 − window)
levels    = ok below 50% · watch from 50% · act from 70%
```

A full window is 100% on its own; attention alone tops out at 50%, so a long plan on an empty window says *watch*, not *act*. The window is measured. **Attention is an estimate**: it counts what tends to split focus, it does not measure the model. The plan comes from `TodoWrite`, `TaskCreate`/`TaskUpdate` and the desktop app's plan tool; Cognita tracks it across compactions.

Which steps it suggests, once pressure is not ok:

| Step | When | One command |
| --- | --- | --- |
| Split the plan across subagents | 5 or more open plan items | `/cognita split` |
| Compact, keeping the goal and the plan | window at 30% or more, 15 or more prompts, or no split to suggest | `/cognita compact` |
| Save decisions to Engram first | one of the above, and an Engram MCP server is connected | `/cognita save` |

Splitting comes first when attention adds more than the window; saving always comes before compacting. Sample output:

```
## Context pressure: 78% · act

`████████████████░░░░` window 75% (150,000 of 200,000 tokens) + attention 25 / 100 (estimate)

1. Save decisions to Engram first. Run `/cognita save`, which sends:
   > Before this conversation is compacted, use mcp__engram__mem_save to save to Engram: the goal, ...
2. Compact, keeping the goal and the plan. Run `/cognita compact`, which does the same as:
   /compact Keep: the goal "Build a context pressure viewer"; in progress: Write the model; open plan: Wire the view, Add tests; decisions made and why, and the files being changed. Drop: finished exploration, long tool output, errors already fixed.
3. Split the plan across subagents. Run `/cognita split`, which sends:
   > Delegate these plan items to subagents, one subagent each, if they do not depend on each other: 1) ...
```

**Automatic help.** After each turn Cognita measures the pressure again. When the level rises (ok to watch, watch to act) a toast names the cause and the one step to take, and that command appears as the prompt box's suggestion (Tab takes it). It warns once per rise, not every turn.

## Supply chain

`/cognita supply` (also `/inspector supply`, and `json` for scripts) answers: what code runs on my machine because of my Claude Code setup, and can it change without me noticing?

It lists every hook command (event, matcher, command, settings source) and every MCP server (transport, command or URL, origin), and marks each one:

| Mark | Meaning |
| --- | --- |
| `⚠ unpinned` | Fetches code fresh: `npx`, `bunx`, `pnpm dlx`, `yarn dlx`, `uvx` or `pipx run` without an exact version, any `@latest`, `docker run` with no tag or with `:latest`, or `curl ... \| sh` |
| `● pinned` | An exact version (`pkg@1.2.3`, `pkg==1.2.3`), an image tag or a digest (`image@sha256:...`) |
| `○ local` | A local path or script |
| `↗ remote` | An http(s) URL; its code can change on the server's side |

The top line counts the unpinned commands: "N unpinned command(s) download code that can change without notice." Plugins are listed with their marketplace and where that marketplace comes from.

Best effort: the plugin API exposes settings and the tool list, not the hooks or MCP configs that plugins bring, so those servers show as "config not readable" and the report says what it could not read. A project `.mcp.json` is noticed but cannot be read (the API lists files, it does not read them). Cognita never changes your settings.

## Commands for scripts

- `/cognita report json`, `/cognita access json` and `/cognita pressure json` print the same data as JSON.
- `/cognita trim` prints the exact command for each step, such as `claude plugin disable cloudflare --scope local` (this project only, with the undo command).
- Set `CLAUDE_INSPECTOR_BUDGET=30k` and the report says whether what loads before the first message fits.

## Cost

Claude Code reports what the session has cost in USD. Cognita keeps the highest value seen for each session, with its local day, in the plugin's own store per project (the last 200 sessions). Writes happen only when the cost grows by a cent.

- `/cognita cost` shows the project total, the last 14 days with a sparkline, the last 20 sessions, the average per session and this session so far. `/cognita cost json` prints the same data for scripts.
- `/cognita history` adds a `$` column per session and a line such as `Spend: $12.40 in 9 sessions · today $1.10`.
- Set `CLAUDE_INSPECTOR_SPEND_BUDGET=50` (USD per month) to see the share used this month in `/cognita cost`, and a startup toast when the month is over it.
- If your Claude Code version does not report a cost, `/cognita cost` says so and nothing else changes.

## Status line and startup check

- **Status line.** `ctx 42% · $0.31 · +3.4k vs last · pressure 62% watch` after every measurement (the change only when the loadout changed, the pressure only when it is not ok).
- **Startup check.** When an interactive session starts, the loadout is measured in the background. A toast warns you if it grew by 2,000 tokens or more since the last session or went over your budget, and names the biggest cause.

## Configuration

Variables are the per-machine fallback; a `.cognita.json` in the project wins.

| Variable | Default | Effect |
| --- | --- | --- |
| `CLAUDE_INSPECTOR_BUDGET` | none | Tokens that may load before the first message, such as `30000`, `30k` or `1.5M` |
| `CLAUDE_INSPECTOR_ALERT` | `2000` | Growth since the last session that raises a startup toast; `0` turns growth alerts off |
| `CLAUDE_INSPECTOR_SPEND_BUDGET` | none | Monthly spend in USD, such as `50`; `/cognita cost` shows the share used and a startup toast warns when over |
| `CLAUDE_INSPECTOR_STARTUP_CHECK` | on | Set it to `0` to skip the background measurement at session start |
| `CLAUDE_INSPECTOR_STATUSLINE` | on | Set it to `0` to keep the status line untouched |
| `CLAUDE_INSPECTOR_PRESSURE_WATCH` | `50` | Pressure (%) from which the level is watch |
| `CLAUDE_INSPECTOR_PRESSURE_ACT` | `70` | Pressure (%) from which the level is act; must be above watch, or both defaults apply |
| `CLAUDE_INSPECTOR_PRESSURE_ALERT` | on | Set it to `0` to turn off the pressure toast after each turn |

### `.cognita.json`: the team policy

Commit a `.cognita.json` at the project root so everyone uses the same rules, like an `.editorconfig`. It is read when the session starts, from the session's working directory.

```json
{
  "budget": "30k",
  "alert": 1500,
  "require": { "env": "ask", "delete": "deny" },
  "actions": [
    { "key": "tf", "label": "Terraform apply", "tool": "Bash", "input": { "command": "terraform apply" }, "risky": true }
  ]
}
```

- `budget` and `alert` take a number or a string such as `"30k"`. They win over `CLAUDE_INSPECTOR_BUDGET` and `CLAUDE_INSPECTOR_ALERT`, which stay as the per-machine fallback.
- `require` maps an action key to the verdict it must have at least: `allow`, `ask` or `deny` (stricter wins). Keys are the built-in ones (`shell`, `edit`, `web`, `push`, `delete`, `env`, `ssh`, `outside`) or your own. An action that is less strict is listed as a violation: `Policy: Read .env secrets must ask; it runs without asking.`
- `actions` adds probes: `key`, `tool` and `input` are required, `label` and `risky` optional. A key may not reuse a built-in one.
- An invalid file never breaks Cognita: it is ignored and the problem shows as a warning in `/cognita access` and the Overview. Cognita only reads this file; it never writes settings.

## Privacy and safety

- Cognita reads; it never changes your settings. `/cognita trim` prints commands for you to run.
- It changes the conversation only when you ask: `/cognita compact` (or `c` on the Overview) compacts, `/cognita save` and `/cognita split` send one prompt. Each prints what it does first.
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
| `src/register.ts` | The hooks module: the `/cognita` command, the pane, the observe-only hooks and the `mcp.connect` hold hook |
| `src/lazy-mcp.ts` | Lazy MCP: the `mcp.connect` hold hook, the hold list in the store, and the `hold`, `connect` and `release` commands |
| `src/loadout.ts` | Context analysis: groups the breakdown, joins it with usage, finds idle items, formats the reports |
| `src/access.ts` | Access analysis: sample actions, tools by server, rules, hooks, plugins, commands, warnings |
| `src/dashboard-view.ts` | The sidebar and the Overview |
| `src/context-view.ts`, `src/access-view.ts`, `src/agents-view.ts` | The Context, Access and Agents views |
| `src/theme.ts` | Colors and the key-hint line shared by the views |
| `tests/*.test.ts` | Pane tests run by `claude plugin test` with a mocked engine |
| `tests/*.test.mjs` | Node unit tests for the analysis, the path helpers and the local install |

## Limits and troubleshooting

- **How much holding saves.** It removes a server's tools from the context at startup. Measured here with tool search on, holding all 9 servers took the loadout from 55,505 to 52,861 tokens (about 2.6k), because deferred tools already cost little. Without tool search the saving is larger.
- **Undo everything.** `/cognita release all` un-holds every server in the project, and the next session loads them again.
- **`/mcp` shows a held server as held by Cognita**, and a reconnect from `/mcp` is held too: use `/cognita connect <server>` instead.
- **Held per project folder.** A subfolder of a project is a different project with its own hold list.
- **Sample actions are samples.** A verdict is what the permission system answers for that exact call. A rule for a narrower command (`Bash(git push origin main)`) can still differ.
- **Session scope.** Usage counts start when the plugin loads and cover only this session. Agents started in other sessions do not appear.
- **"Unused" is a hint.** It means no calls in this session so far. Measure after real work, not right at startup.
- **The pane doesn't open.** Run `claude plugin validate <plugin folder>`, then `/reload-plugins`. Start `claude --debug` to see any hook errors. `/cognita report` and `/cognita access` work without the pane.
- **Two plugins answer `/inspector`.** An earlier version is installed as `workspace-dashboard`. `npm run install:local` removes it, or delete `~/.claude/skills/workspace-dashboard`.
- **`/cognita compact` did not start.** Claude Code compacts only between turns. The command prints the `/compact …` line: run that instead.
- **Pressure shows no plan in `claude -p`.** Headless sessions have no todo or task tool, so only the window and your prompts count there.
- **Git Bash on Windows.** `claude -p "/cognita access"` can turn `/cognita` into a Windows path. Run it from PowerShell or set `MSYS_NO_PATHCONV=1`.
