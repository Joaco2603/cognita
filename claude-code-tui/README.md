# Workspace Dashboard

Workspace Dashboard is a Claude Code mod that opens an interactive pane inside the current Claude Code terminal session. It provides Dashboard and Agents navigation, a searchable workspace list, a live view of agents in the current session, and a submenu for launching a subagent in the selected workspace. The dashboard uses Claude Code's agent API; it does not open a separate Claude Code process.

## Run locally

```bash
npm install
npm run build
npm run install:local
```

After installing once, start Claude Code normally with `claude` and run `/inspector` to open the pane. Use `1` and `2` to switch Dashboard and Agents, `f` to search workspaces, and `n` to start a fresh conversation in the current working directory (`/clear`). Dashboard shows a context overview; refresh it to capture a `/context` snapshot. In Agents, switch between active and inactive agents, search the list, and select an agent to inspect its reported token samples and task status. The plugin API does not expose full agent prompts or skill-use events. Choose **New agent** to enter a task and start it in the selected workspace. For an already-running session, run `/reload-plugins` after installing.

Workspaces are discovered from `~/programming` by default. Set `CLAUDE_CODE_WORKSPACES_DIR` before starting Claude Code to use a different directory. The current session's working directory is included even when it is outside that root.

## Development checks

```bash
npm run build
npm test
npm run validate
```

Agent monitoring is scoped to agents in the current Claude Code session. Background sessions started elsewhere are not included in this pane.
