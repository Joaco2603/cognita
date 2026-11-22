# Cognita

**See everything your Claude Code agent has access to.**

<img src="claude-code-tui/.claude-plugin/icon.png" alt="Cognita" width="96" align="right">

Every Claude Code session starts with things you didn't choose on purpose: CLAUDE.md files, MCP servers with hundreds of tools, plugin skills, hooks from your settings. Permission rules piled up over months decide what runs without asking. Cognita shows all of it in one pane, inside the session you are already in:

- **What your agent has loaded.** What fills the context window before you type, what it never uses, and the exact commands to trim it.
- **What your agent can do.** Which tools it can call, which risky actions (git push, `rm -rf`, reading `.env` or SSH keys, writing outside the project) run **without asking you**, and the rules, hooks and plugins behind that.
- **What it is doing.** The subagents running in the session and their token use.
- **How hard the context is working.** One pressure percentage (window plus an estimate of what splits attention: open plan items, long instructions, many turns) and the one step that relieves it: `/cognita compact` with focus built from your goal and plan, `/cognita save` to Engram, or `/cognita split` to subagents. It warns you on its own when pressure rises.

```bash
claude plugin marketplace add Joaco2603/cognita
claude plugin install cognita@cognita
```

Or, inside a session: `/plugin marketplace add Joaco2603/cognita`, then `/plugin install cognita@cognita`.

Then run `/cognita` in a new session.

## Who it's for

- **Developers using Claude Code every day**, who want to know why a session starts at 35k tokens and which plugin or MCP server to turn off.
- **Teams and leads** who need to check what an agent can do on a machine before trusting it with a repo: one `/cognita access` shows whether `git push` or reading `.env` runs without asking.
- **Plugin and MCP authors**, who want to see what their plugin costs in context and which sections it injects into the system prompt.

## What it looks like

**Live demo video (96 s, voiced):** [English](./demo/cognita-demo-en.mp4) · [Español](./demo/cognita-demo-es.mp4). A short intro explains what Claude Code loads and the three things Cognita shows, then a screen recording of a real Claude Code session, with zooms and highlights on each finding: the Overview, `/cognita access` catching `.env` reads, the deny rule added live, the re-check showing it blocked, and `/cognita trim`.

Real output of `/cognita access`, trimmed and with the home path shortened:

```markdown
## What this agent can do

Model `claude-haiku-5-5` · Claude Code 2.1.330 · permission mode `default`

- **1 risky action(s) run without asking: read .env secrets.**
- **14 hook command(s) from your settings run on your machine during the session.**

| Action | Tool | Verdict | Why |
| --- | --- | --- | --- |
| ⚠ Push to a git remote | Bash | ◐ asks you first | This command requires approval |
| ⚠ Read .env secrets | Read | ● runs without asking |  |
| ⚠ Read SSH keys | Read | ◐ asks you first | Claude requested permissions to read from ~/.ssh/id_rsa, but you haven't granted it yet. |
```

Real output of `/cognita trim`:

```markdown
## Trim plan

Loaded before any message: **33,710 tokens**.

1. Disable plugin `cloudflare` (16 skills, none used): frees ~1,080 (total ~1,080)
   claude plugin disable cloudflare --scope local
2. Disable MCP server `claude_ai_Claude_Docs` for this project (3 loaded tools, no calls): frees ~585 (total ~1,665)
```

The pane (`/cognita`) has four views: **Overview**, **Context**, **Access** and **Agents**. Switch with `1`–`4`, refresh with `r`, close with `Esc`. Each view lists its keys on its last line.

Full documentation, all commands, hotkeys and configuration: [`claude-code-tui/README.md`](./claude-code-tui/README.md).

## Install from a clone

```bash
git clone https://github.com/Joaco2603/cognita
cd cognita/claude-code-tui
npm install
npm run build
npm run install:local   # copies the plugin to ~/.claude/skills/cognita
```

Start a new Claude Code session and run `/cognita`. Requires Claude Code 2.1.275 or later, and Node.js with npm to build.

## Repository

| Path | Contents |
| --- | --- |
| [`claude-code-tui/`](./claude-code-tui) | The Cognita plugin: TypeScript sources, compiled hooks, tests |
| [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json) | The marketplace entry for one-step install |
| [`HACKATHON.md`](./HACKATHON.md) | Dojo AI Hackathon context: criteria, baseline, progress log, checklist |
| [`demo/`](./demo) | The demo video and its HyperFrames source |
| [`skills/`](./skills) | Local skills used while building |
| [`graphify-out/`](./graphify-out) | A generated graph of the code |

## Development

```bash
cd claude-code-tui
npm test           # build + 37 node unit tests + 28 pane tests (claude plugin test)
npm run validate   # claude plugin validate .
```

## How we used AI coding

Cognita was built with Claude Code during the Dojo AI Hackathon (Track 01: Build for Builders). Claude Code wrote most of the TypeScript, the tests and the docs from the team's direction. The team set the product direction, reviewed each change and tested it in real sessions. Each feature was checked against a real session (`claude -p "/cognita access" --plugin-dir ./claude-code-tui`), and those runs caught real bugs: deferred tools counted inside the window (163%), and a module that the engine refused to load. The [progress log in HACKATHON.md](./HACKATHON.md#avance-durante-el-hackathon) lists what changed and when.

## License

[MIT](./LICENSE)
