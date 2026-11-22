# Changelog

All notable changes to Cognita are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- `/cognita tutorial`: a guided path through the commands, grouped by the question a user has (what loads, what it can do, how to load less, how it changes and costs), with the reference commands at the end.

## [0.9.0] - 2026-11-22

### Added
- Team policy in the repo: `.cognita.json` at the project root sets the budget, the growth alert and the minimum verdict per action (for example, reading `.env` must ask). It wins over the `CLAUDE_INSPECTOR_*` env vars, and Access reports each violation. A bad file becomes a warning, never a crash.
- Custom actions: `actions` in `.cognita.json` adds team commands such as `terraform apply` to the Access check.
- Access asks the permission system about every loaded MCP tool (nothing runs) and lists, per server, which run without asking.
- Access flags allow rules that are too broad, such as `Bash(*)` or a whole MCP server, with the settings file that defines them.
- `/cognita supply [json]`: every hook command and MCP server, where it comes from, and whether it is pinned to a version. Unpinned `npx`/`uvx`/`bunx` packages, `@latest` and untagged Docker images are flagged.
- `/cognita cost [json]`: what sessions cost in dollars in this project, per day and per session; `/cognita history` gets a `$` column. `CLAUDE_INSPECTOR_SPEND_BUDGET` sets a monthly budget.
- `/cognita doctor` and a load-time compatibility check: if Claude Code lacks an engine API that Cognita needs, a toast names the feature that is off.
- CI on GitHub Actions (Linux, macOS, Windows) against the latest Claude Code, also weekly.

## [0.8.0] - 2026-11-21

### Added
- Lazy MCP: `/cognita hold <server>` keeps an MCP server off at startup for a project, using the engine's `mcp.connect` hook (no settings files are touched). `/cognita connect` (or `c` in the pane) brings it back mid-session and `/cognita release` makes it load every time. Nothing is held by default.
- Suggestions: a server that loaded in 3 sessions of the project without a single call is offered as a candidate.

### Changed
- The trim plan proposes `/cognita hold` instead of `/mcp`.
- Commands also answer under the `/inspector` alias.

## [0.7.1] - 2026-11-21

### Added
- Live demo video in English and Spanish, recorded from a real Claude Code session.

### Changed
- The pane opens at 110x40 and switches to a compact tabbed layout below 80 columns.

### Fixed
- Duplicate sidebar labels and truncated values in Access.

## [0.7.0] - 2026-11-21

### Added
- Rebrand to Cognita: plugin `cognita`, command `/cognita` (`/inspector` stays as an alias), plugin icon and MIT license.
- Access view: asks the permission system what it would answer for 8 sample actions (shell, edit, web, git push, `rm -rf`, read `.env`, read SSH keys, write outside the project) without running anything, and flags risky ones that run without asking.
- `/cognita access` and `/cognita access json`.
- Overview view: context, access and agents on one screen, warnings first.

### Changed
- Simplified sidebar (project, model, views 1-4) with a shortcut line at the bottom of each view.

### Removed
- The workspace list.

### Fixed
- The engine refused to load the module when `$` was passed to internal functions; `register.ts` now uses top-level functions with a state object.

## [0.6.0] - 2026-11-21

### Added
- `/inspector trim`: each lever as a step with its exact command, a running total and how many steps fit the budget.

## [0.5.0] - 2026-11-21

### Added
- `/inspector history`: trend of the last 20 sessions in the project, with a sparkline, total change, sessions over budget and one row per session.

## [0.4.0] - 2026-11-21

### Added
- Startup alert: a toast when the loadout grew by 2,000 tokens or more (configurable) or is over budget, naming the main cause.
- `CLAUDE_INSPECTOR_BUDGET` (accepts `30k`, `1.5M`) and a budget verdict in the report.
- Status line shows the change against the previous session.
- `/inspector report json` for scripts and CI.

## [0.3.0] - 2026-11-21

### Added
- "Since last session": each measurement is stored per project in `$.store` and the next session shows what changed before the first message.

## [0.2.0] - 2026-11-20

### Added
- Context tab: window meter, breakdown by category, CLAUDE.md and memory files, MCP servers, skills, agents and system prompt sections.
- "Loaded but unused" and "Biggest levers" sections.
- `/inspector report [full]` in Markdown; status line shows `ctx % · $cost`.
- Observe-only hooks for tool calls, skill prompts and prompt composition.
- One-step install through `.claude-plugin/marketplace.json`.
- Windows support.

## [0.1.0] - 2026-11-20

### Added
- Workspace Dashboard plugin: `/inspector` opens a pane with a workspace list and Agents tab (active and inactive agents, tokens, status, launching a new subagent).
