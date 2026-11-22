# Lazy MCP

Objective: MCP servers a project does not use stay off at startup, and one key or command brings them back. Branch `feat/lazy-mcp`. Delivery: `ask-on-risk`. Runner: `npm run test:unit`, `npm test`, `npm run validate` (from `claude-code-tui/`).
Routing: opus planned, haiku mapped the code, sonnet writes (repo-graph-routing). Graph: `graphify-out/` (`graphify update .` after code changes).

## Specs

S1. Hold hook. `on('mcp.connect', ...)` in `src/register.ts`, wrapped in try/catch; any error falls through to `next?.(event)` (fail open).
- Record every `event.server` it sees in `knownServers` (comparison key to display name).
- Hold a raise only when `next.origin.plugin === 'engine'`, the server's key is in the project hold list, and the key is NOT in `connectedNow`. Hold EVERY such engine raise, not just the first: evidence (L3) shows the engine raises a held server a second time at startup, so a hold-once rule would let it through.
- Hold answer, exact shape: `{ value: { isConnected: false, reason: 'disabled', message: 'Held for this project by Workspace Dashboard. Bring it back: /inspector connect <server>' } }` (proposed text). A bare object is refused by the engine. Add the key to `heldNow`.
- Pass through: raises from any plugin (including our own `$.mcp.connect`), servers not on the list, and keys in `connectedNow`.
- Load the hold list once per session (memoized promise). Project folder: `currentDirectory || await $.session.cwd()`. Empty folder or failed read gives an empty list, and the server connects.

S2. Names, in new `src/lazy-mcp.ts`: `toolName(name)` replaces every char outside `[A-Za-z0-9_-]` with `_` (`plugin:cloudflare:cloudflare` to `plugin_cloudflare_cloudflare`, `claude.ai Claude Docs` to `claude_ai_Claude_Docs`); `serverKey(name) = toolName(name).toLowerCase()`; `resolveServer(input, candidates)` matches by key. Candidates in order: `knownServers` display names, the hold list, then the last measured loadout's MCP server names; the display name wins on a tie. `/inspector` lowercases its args today, so take the server name from the raw `event.args` tail.

S3. Store. `held:${cwd}` is a `string[]` deduplicated by key; an invalid stored value reads as `[]`. Only `hold` and `release` write it.

S4. Commands (texts are proposals; add one HELP line each).
- `/inspector hold <server>`: add to the list. "Held `X` for this project: it stays off from the next session (frees ~N tokens at each start). Bring it back any time: `/inspector connect X`." Drop the tokens clause when unknown. Already held: "`X` is already held for this project." No match: "No MCP server matches `foo`. Known: a, b, c."
- `/inspector hold` (no name): Markdown list of held servers with status (`held now`, `connected this session`, `from next session`) plus S8 suggestions; empty: "Nothing held for this project."
- `/inspector connect [server]`: `$.mcp.connect(displayName)`; no name connects every key in `heldNow`. Success adds the key to `connectedNow`: "Connected `X` for this session; its tools arrive with the next request. It stays held at the next start: `/inspector release X` loads it every time." Refusal: "Could not connect `X`: <message>".
- `/inspector release <server|all>`: remove from the list; connect it now if it was held this session. "Released `X`: it loads at every start again."

S5. Pane, MCP subview (`src/context-view.ts`); callbacks `onHold(server)` and `onConnect(server?)` from register.ts; after a press, toast the S4 text and redraw.
- Idle servers (0 calls, tokens > 0) not held get a Button: key `context-mcp-hold-<slug>`, label `⏸ <server>`, under a dim line "Hold for this project (off from the next session):". No hotkey.
- Section `HELD FOR THIS PROJECT · N`: one Button per held server, key `context-mcp-held-<slug>`, label `↺ <name>`, dim status after it. When at least one is held now and not connected, a Button key `context-mcp-connect-held`, label `↺ Connect held`, hotkey `c` (free).
- Held servers vanish from the breakdown; this section keeps them visible.

S6. Report, trim, status line.
- `findLevers` MCP lever text: "Hold MCP server `X` for this project (...)". `leverSteps` MCP step: a code block `/inspector hold <target>`, then "From the next session in this project; `/inspector connect <target>` brings it back any time." No more `/mcp` → Disable.
- `/inspector report` adds a line built in register.ts (no `formatReport` signature change): "Held for this project: a, b (not loaded this session) · `/inspector connect <name>`".
- Status line appends `N MCP held` when `heldNow` minus `connectedNow` is above zero.

S7. Safety. The hook never throws; default holds nothing; holding never disconnects a server in the current session; never hold the plugin's own server (`workspace-dashboard`).

S8. Suggestions (cut first if short on time). Store `mcp-usage:${cwd}` = `{ sessionId, servers: Record<toolName, { loadedIn, usedIn }> }`. Loaded: in `compareWithLastSession`, +1 `loadedIn` per measured server only when the stored `sessionId` differs. Used: in `tool.call`, first `mcpServerOf(tool)` call per server per session, +1 `usedIn`, fire-and-forget, never delays `next`. Rule `loadedIn >= 3 && usedIn === 0` (`HOLD_AFTER_SESSIONS = 3`). `/inspector hold` prints "Suggested: X (loaded in 6 sessions here, never called)"; hold buttons add ` · unused in N sessions`.

S9. Model reconnect tool (`$.tool.register` + filtered `tool.run`). STRETCH: out of scope for this run.

S10. Docs and version. README: usage rows for `hold`, `connect`, `release`; honest savings note (measured 55,505 → 52,861 tokens, about 2.6k for 9 servers with tool search on; larger without it); troubleshooting (`/inspector release all` un-holds everything; `/mcp` shows held servers as held by the plugin and a `/mcp` reconnect is held too, use `/inspector connect`; a subfolder is a different project). Version 0.7.0 in `package.json`, `.claude-plugin/plugin.json`, top-level `package-lock.json`. HACKATHON.md entry is written by the parent.

## Tasks

| ID | Specs | Route | Status | Evidence |
| --- | --- | --- | --- | --- |
| T1 | S2, S3 | delegated (sonnet) | done | feat commit; 40 unit + 32 UI green |
| T2 | S1, S7 | delegated (sonnet) | done | feat commit; 40 unit + 32 UI green |
| T3 | S4 | delegated (sonnet) | done | feat commit; 40 unit + 32 UI green |
| T4 | S5, S6 status line | delegated (sonnet) | done | feat commit; 40 unit + 32 UI green |
| T5 | S6 trim, report | delegated (sonnet) | done | feat commit; 40 unit + 32 UI green |
| T6 | S8 | delegated (sonnet) | done | feat commit; 40 unit + 32 UI green |
| T7 | S9 | stretch, not started | dropped for now | |
| T8 | S10 | sonnet (README, versions); parent (HACKATHON.md) | done | feat commit |

Route evidence: the user asked for model routing (L1): opus plans, sonnet writes, haiku reads.

## Log

- L1 (2026-11-21, user, answering "¿Qué implemento primero?" with Lazy MCP as the recommended option): "si pero usa opus pensar, sonnet escribir, haiku leer y graphyfy, eso skill de esto y global e inicializalo para este proyecto"
- L2: Probe on Claude Code 2.1.330 (`claude -p "/probe" --plugin-dir <probe>`): `$.process.run` works; an `mcp.connect` hold needs `{ value: {...} }`; holding all servers took 55,505 to 52,861 tokens; `$.mcp.connect('context7')` reconnected mid-session (+215 tokens, tools deferred).
- L3: In the hold run, each local server (`context7`, `plugin:cloudflare:cloudflare`, `plugin:neon:neon`, `vercel`, ...) was raised twice by the engine at startup; both raises were held and 0 servers loaded. Hence S1 holds every engine raise for a held key.
- L4: Breakdown names (`plugin_cloudflare_cloudflare`, `claude_ai_Claude_Docs`) differ from `mcp.connect` names (`plugin:cloudflare:cloudflare`, `claude.ai Claude Docs`); `toolName` maps one to the other.
- L5: Opus plan accepted with the S1 correction; T7 deferred. Engram mirror pending (Engram tools unavailable in this session).
- L6: Writer deviation: `$` cannot be passed into another module (engine refuses "$ itself is passed as an argument"), so `src/lazy-mcp.ts` takes a `LazyIo` built by `lazyIo($)`. The test engine has no `$.mcp`, so hook/connect/release are node tests with a fake `LazyIo`.
- L7: Parent check, fresh headless sessions: holding `context7` and `vercel` removed both from the loadout (55,849 to 55,000 tokens); `release all` left nothing held. Parent fixed two texts with RED first: release no longer says "stays held", and suggestions use the /mcp display name. Final: `npm test` 40 unit + 32 UI pass, `npm run validate` passes. Unverified: `/mcp` "held by" display, pane `c` button and status line render (no rendered pane in headless runs).
