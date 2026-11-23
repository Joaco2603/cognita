# Cognita: feature test script before the ad recording

Run this once, end to end, before recording. Each step says what to type and what you should see. Mark a step only when you saw it work. Anything that fails is fixed before recording, not hidden in the edit.

## 0. Setup

```bash
cd claude-code-tui
npm install
npm test
npm run build
npm run install:local
```

- [ ] `npm test` passes (unit and pane tests).
- [ ] A scratch project for the take, with a `.env` file and no deny rule in `.claude/settings.json`, so Access has a real finding to show.

## Part A. Claude Code (terminal)

Start a new session in the scratch project: `claude`.

### A1. Pane and views

- [ ] `/cognita` opens the pane on the **Overview**: Context, Access and Pressure cards.
- [ ] `1` to `5` switch to Overview, Context, Access, Agents and Pressure.
- [ ] `r` refreshes, `Esc` closes. Each view shows its keys on its last line.

### A2. Context: what it loads

- [ ] `2`, then `o` `m` `p` `s` `y` cycle through Overview, Files, MCP, Skills and Prompt.
- [ ] "Loaded but unused" lists skills or MCP servers with no calls.
- [ ] `x` asks for the exact count and the numbers update.

### A3. Access: what it can do

- [ ] `/cognita access` prints "Runs without asking: read .env secrets".
- [ ] `3`, then `a` `t` `u` `k` cycle through Actions, Tools, Rules and Hooks & plugins.
- [ ] Ask Claude to add `"permissions": { "deny": ["Read(./.env)"] }` to `.claude/settings.json`.
- [ ] `/cognita access` again: the .env row reads `○ blocked`.

### A4. Trim, history, cost

- [ ] `/cognita trim` prints a plan with the exact command, the tokens it frees and the undo command.
- [ ] `/cognita history` shows the last sessions with a sparkline.
- [ ] `/cognita cost` shows the total, per day and this session.

### A5. Lazy MCP

- [ ] `/cognita hold` with no name lists held servers and suggests idle ones.
- [ ] `/cognita hold <server>`, start a new session: the server is not loaded.
- [ ] `/cognita connect <server>` brings it back with no restart.
- [ ] `/cognita release <server>` so it loads at every start again.

### A6. Supply chain and doctor

- [ ] `/cognita supply` lists hooks and MCP servers as `⚠ unpinned` or `● pinned`.
- [ ] `/cognita doctor` prints the Claude Code version and the engine APIs.

### A7. Pressure and tags (new)

- [ ] Send a prompt with tags:
  `Refactor the cache. <constraint id="main">Do not touch main</constraint> <decision id="db">Use SQLite: it ships with the runtime</decision> <open>Benchmark the new cache</open>`
- [ ] Ask for a plan with 5 or more steps, so the plan tool has open items.
- [ ] `/cognita pressure` shows the meter, the attention signals and a "What to do" list.
- [ ] `/cognita pressure open` (or `5`) shows each tag with its share of attention.
- [ ] `/cognita split` sends the prompt that hands plan items to subagents.
- [ ] `4` (Agents) lists the subagents and their tokens.
- [ ] `/cognita compact` (or `c` in Pressure): after it, the Pressure view shows each tag as kept, rewritten or lost, and a toast names any loss.
- [ ] If Engram is connected: `/cognita save` sends the save prompt. Without Engram it says it needs one.
- [ ] The pressure toast appears on its own when pressure passes 50%.

## Part B. Claude Desktop (Code tab)

Open the same scratch project in the Code tab of the Claude desktop app.

- [ ] `/cognita` opens the pane in the desktop session.
- [ ] Ask for a plan with several steps: the desktop plan list appears.
- [ ] `/cognita pressure` counts those plan items (it reads the desktop app's plan tool), with only one item in progress at a time.
- [ ] Tagged prompt from A7 works the same: `/cognita pressure open` shows the tags.
- [ ] `/cognita compact` from the desktop session keeps the tagged items and the plan.
- [ ] `/cognita access` shows the same finding as in the terminal.

## Shots to record for the ad

Take order for storyline C ("Dive into the pane"), all from one real session:

1. Plain session, `/cognita` typed, pane opens (Overview).
2. Context: the "loaded but unused" line.
3. Access: "read .env secrets" in red, then `○ blocked` after the deny rule.
4. Agents: subagents after `/cognita split`.
5. Pressure: tags with their attention share, then kept / rewritten / lost after compact.
6. The same Pressure view in the Claude desktop app, with the plan list beside it.
7. Install line: `/plugin install cognita@cognita`.

Recording needs macOS Screen Recording permission for the app that records.
