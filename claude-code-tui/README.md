# Workspace Dashboard

A Claude Code plugin that shows **what your session has loaded into the context window and whether it is earning its keep**. It runs inside your current Claude Code terminal session, so there is no separate app or second Claude process.

- **Context loadout.** A live meter of the window, the categories filling it (system prompt, tools, MCP tools, memory files, skills, messages), each CLAUDE.md/memory file, each MCP server, each skill and each custom agent, with its token cost.
- **Biggest levers.** The few changes that would free the most context, with their saving: idle MCP servers, plugins whose skills never ran, and CLAUDE.md files of 2,000 tokens or more. Savings under 200 tokens are left out.
- **Since last session.** Each measurement is saved per project, so the next session shows what changed: `MCP server linear: added, 3,000 tokens`, a plugin's skills growing, a CLAUDE.md that doubled, a model switch. Catch context creep before it costs you.
- **Loaded but unused.** The plugin watches tool calls and skill use in the session and lists the MCP servers and skills that cost tokens but were never used. These are the first candidates to disable for the project.
- **System prompt sections.** See every section of the last composed system prompt, including the ones *other plugins* inject (`<plugin>:<name>` ids), with approximate token sizes.
- **Trim plan.** `/inspector trim` turns the levers into numbered steps with the exact command for each one (`claude plugin disable cloudflare --scope local`, `/inspector hold <server>` for an MCP server), a running total, and how many steps it takes to get within your budget. Plugin changes apply to this project only and come with the undo command.
- **Lazy MCP.** `/inspector hold context7` keeps an MCP server off from the next session in this project, and `/inspector connect context7` brings it back any time, mid-session, with no restart. The MCP view in the pane has the same buttons, and after a few sessions of a server being loaded and never called the plugin suggests holding it. Holding is per project, never disconnects a server in the current session, and falls back to connecting everything if anything goes wrong.
- **History.** `/inspector history` shows how the loadout moved over the last 20 sessions in the project: a sparkline, the overall change, how many sessions went over budget, and one row per session.
- **Startup check.** When a session starts, the loadout is measured in the background. A toast warns you if it grew by 2,000 tokens or more since the last session, or went over your budget, and names the biggest cause: `Context loadout grew +3.4k since last session, mostly MCP server linear (new)`.
- **Context budget.** Set `CLAUDE_INSPECTOR_BUDGET=30k` and the report says whether what loads before the first message fits.
- **Shareable report.** `/inspector report` prints the loadout as Markdown that you can paste into an issue, a PR or a team channel.
- **Status line.** Shows `ctx 42% · $0.31 · +3.4k vs last` after every measurement (the last part only when the loadout changed). Turn it off with `CLAUDE_INSPECTOR_STATUSLINE=0`.
- **Workspaces and agents.** Shows a searchable workspace list, the agents running in this session with token samples, and a launcher for a background subagent in any workspace.

## Install

From Claude Code (2.1.275 or later):

```
/plugin install workspace-dashboard --marketplace Joaco2603/cognita
```

From a clone instead:

```bash
cd claude-code-tui
npm install
npm run build
npm run install:local   # copies the plugin to ~/.claude/skills/workspace-dashboard
```

Start Claude Code with `claude` and run `/inspector`. If a session is already running, run `/reload-plugins` first.

## Usage

| Command | What it does |
| --- | --- |
| `/inspector` | Open the dashboard pane |
| `/inspector context` | Open the pane on the context loadout |
| `/inspector report` | Print the loadout as Markdown (estimated counts, fast) |
| `/inspector report full` | The same report with exact token counts |
| `/inspector trim` | A step-by-step plan, with commands, to shrink what loads before the first message |
| `/inspector history` | The loadout over the last 20 sessions in this project, with a sparkline |
| `/inspector hold <server>` | Keep an MCP server off from the next session in this project; with no name, list what is held and suggest idle servers |
| `/inspector connect [server]` | Bring a held server back for this session; with no name, every server held now |
| `/inspector release <server\|all>` | Stop holding it, so it loads at every start again |
| `/inspector report json` | The same data as JSON, for scripts and CI (combine with `full`) |
| `/inspector help` | List the subcommands |

Hotkeys in the pane:

| Key | Action |
| --- | --- |
| `1` / `2` / `3` | Dashboard, Context, Agents |
| `o` `m` `p` `s` `y` | Context subviews: Overview, Files, MCP, Skills, Prompt |
| `r` | Measure again (estimated) |
| `c` | MCP view: connect the servers held in this session |
| `x` | Exact count (asks Claude Code for a full breakdown) |
| `f` | Search workspaces |
| `n` | New conversation in the current workspace (`/clear`) |

### Reading the Context tab

- **Estimated or exact.** `r` asks Claude Code for a summary breakdown, which is fast and estimated. `x` asks for a full breakdown, the same counting `/context` does.
- **MCP rows.** These read `server  loaded/total · N calls`. Deferred tools (not loaded yet) don't count against the window. `N calls` counts the calls made since the plugin loaded.
- **Deferred.** Tools listed as deferred are outside the window until ToolSearch loads them. They show on a separate line rather than as part of how full the window is.
- **Skills by source.** The Skills subview and the report group skills by plugin or settings source, so one noisy plugin stands out.
- **Since last session.** The baseline is the last measurement saved by *another* session in the same folder, so measuring twice in one session never compares a session with itself. Only changes of 50 tokens or more are listed, and the conversation (Messages) is left out, so the number means "what loads before you type".
- **Loaded but unused.** This covers loaded MCP servers with zero calls and skills with zero invocations, sorted by token cost. It is a hint, not a verdict: a skill can be worth listing even if this session did not use it.
- **Prompt subview.** This view fills in after the first prompt that is composed while the plugin is loaded.

## Configuration

| Variable | Default | Effect |
| --- | --- | --- |
| `CLAUDE_CODE_WORKSPACES_DIR` | `~/programming`, then the current directory's parent | The folder whose subfolders are listed as workspaces |
| `CLAUDE_INSPECTOR_STATUSLINE` | on | Set it to `0` to keep the status line untouched |
| `CLAUDE_INSPECTOR_BUDGET` | none | Tokens that may load before the first message, such as `30000`, `30k` or `1.5M` |
| `CLAUDE_INSPECTOR_ALERT` | `2000` | Growth since the last session that raises a startup toast; `0` turns growth alerts off |
| `CLAUDE_INSPECTOR_STARTUP_CHECK` | on | Set it to `0` to skip the background measurement at session start |

The current working directory is always listed, even when it is outside the workspaces root.

## Development

```bash
npm install
npm run build      # tsc: src/*.ts -> hooks/*.js (the compiled hooks are committed)
npm test           # build + node unit tests + claude plugin test (UI tests)
npm run test:unit  # build + node unit tests only (no Claude Code needed)
npm run validate   # claude plugin validate .
```

Layout:

| Path | Role |
| --- | --- |
| `src/register.ts` | The hooks module: the `/inspector` command, the pane, and the observe-only hooks (`tool.call`, `skill.prompt`, `prompt.compose`, `prompt.context`, `session.measure`) and the `mcp.connect` hold hook |
| `src/lazy-mcp.ts` | Lazy MCP: the `mcp.connect` hold hook, the hold list in the store, and the `hold`, `connect` and `release` commands |
| `src/loadout.ts` | Pure analysis: groups the breakdown, joins it with usage, finds idle items, formats the report |
| `src/context-view.ts` | The Context tab |
| `src/dashboard-view.ts`, `src/agents-view.ts` | The Dashboard and Agents tabs |
| `tests/*.test.ts` | Pane tests run by `claude plugin test` with a mocked engine |
| `tests/*.test.mjs` | Node unit tests for `loadout.js`, the path helpers and the local install |

Every observing hook only reads the event and passes it on (`next(event)`). Hooks are wrapped in `try/catch`, so a measuring bug can never block a tool call or a prompt.

## Limits and troubleshooting

- **How much holding saves.** It removes a server's tools from the context at startup. Measured here with tool search on, holding all 9 servers took the loadout from 55,505 to 52,861 tokens (about 2.6k), because deferred tools already cost little. Without tool search the saving is larger.
- **Undo everything.** `/inspector release all` un-holds every server in the project, and the next session loads them again.
- **`/mcp` shows a held server as held by this plugin**, and a reconnect from `/mcp` is held too: use `/inspector connect <server>` instead.
- **Held per project folder.** A subfolder of a project is a different project with its own hold list.
- **Session scope.** Usage counts start when the plugin loads and cover only this session. Agents started in other sessions do not appear.
- **What the API hides.** The plugin API does not expose full subagent prompts.
- **Windows.** Paths with `\` and `/` both work. If workspaces don't show up, set `CLAUDE_CODE_WORKSPACES_DIR` to an absolute path.
- **The pane doesn't open.** Run `claude plugin validate <plugin folder>`, then `/reload-plugins`. Start `claude --debug` to see any hook errors.
