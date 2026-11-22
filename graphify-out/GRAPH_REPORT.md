# Graph Report - claude-ai-context  (2026-11-21)

## Corpus Check
- 27 files · ~31,623 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: (none) 3)

## Summary
- 273 nodes · 627 edges · 21 communities (17 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `189d31be`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- register.ts
- package.json
- utils.js
- compilerOptions
- install-local.mjs
- mod-api.d.ts
- context.test.ts
- loadout.ts
- loadout.js
- register.ts
- register.js
- context-view.ts
- context-view.js
- lazy-mcp.test.mjs
- loadout.test.mjs
- baseTokensOf
- lazy-mcp.ts

## God Nodes (most connected - your core abstractions)
1. `register()` - 23 edges
2. `register()` - 23 edges
3. `renderContext()` - 12 edges
4. `renderContext()` - 12 edges
5. `formatTokenCount()` - 12 edges
6. `formatTokenCount()` - 12 edges
7. `createLazyMcp()` - 10 edges
8. `formatReport()` - 10 edges
9. `serverKey()` - 9 edges
10. `createLazyMcp()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `renderContext()` --calls--> `serverKey()`  [EXTRACTED]
  claude-code-tui/hooks/context-view.js → claude-code-tui/hooks/lazy-mcp.js
- `register()` --calls--> `renderContext()`  [EXTRACTED]
  claude-code-tui/hooks/register.js → claude-code-tui/hooks/context-view.js
- `register()` --calls--> `createLazyMcp()`  [EXTRACTED]
  claude-code-tui/hooks/register.js → claude-code-tui/hooks/lazy-mcp.js
- `readLoadout()` --calls--> `summarize()`  [EXTRACTED]
  claude-code-tui/hooks/register.js → claude-code-tui/hooks/loadout.js
- `register()` --calls--> `formatReport()`  [EXTRACTED]
  claude-code-tui/hooks/register.js → claude-code-tui/hooks/loadout.js

## Import Cycles
- None detected.

## Communities (21 total, 4 thin omitted)

### Community 0 - "register.ts"
Cohesion: 0.36
Nodes (9): renderAgents(), discoverWorkspaces(), AgentSubview, basename(), dirname(), formatTokenCount(), isActiveAgent(), joinPath() (+1 more)

### Community 1 - "package.json"
Cohesion: 0.15
Nodes (13): devDependencies, typescript@5.9.3, name, private, scripts, build, install:local, test (+5 more)

### Community 2 - "utils.js"
Cohesion: 0.46
Nodes (6): renderAgents(), discoverWorkspaces(), basename(), dirname(), isActiveAgent(), joinPath()

### Community 6 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, module, moduleResolution, noEmitOnError, outDir, rootDir, skipLibCheck, strict (+2 more)

### Community 7 - "install-local.mjs"
Cohesion: 0.19
Nodes (4): installRoot, manifestPath, pluginRoot, projectRoot

### Community 8 - "mod-api.d.ts"
Cohesion: 0.11
Nodes (17): AgentInfo, ContextAgent, ContextCategory, ContextMcpTool, ContextMemoryFile, ContextSkill, InstructionFile, ModApi (+9 more)

### Community 9 - "context.test.ts"
Cohesion: 0.13
Nodes (8): breakdown, lastSession, mockSession(), openContext(), pane, pane, breakdown, pane

### Community 11 - "loadout.ts"
Cohesion: 0.11
Nodes (23): CHANGE_LABEL, formatHistory(), formatWhen(), IdleItem, isSnapshot(), isTrendPoint(), LARGE_INSTRUCTION_FILE, Lever (+15 more)

### Community 12 - "loadout.js"
Cohesion: 0.16
Nodes (19): baseTokensOf(), CHANGE_LABEL, DEFAULT_GROWTH_ALERT, findLevers(), formatJson(), formatTrimPlan(), isConversation(), LARGE_INSTRUCTION_FILE (+11 more)

### Community 13 - "register.ts"
Cohesion: 0.14
Nodes (22): LazyIo, LazyMcp, AlertSettings, DEFAULT_GROWTH_ALERT, diffLoadout(), emptyUsage(), mcpServerOf(), measurePrompt() (+14 more)

### Community 14 - "register.js"
Cohesion: 0.26
Nodes (14): diffLoadout(), emptyUsage(), mcpServerOf(), measurePrompt(), parseTokens(), recordSkillUse(), recordToolCall(), sinceBadge() (+6 more)

### Community 15 - "context-view.ts"
Cohesion: 0.16
Nodes (19): renderContext(), renderDashboard(), renderSidebar(), HeldView, estimateTokens(), formatReport(), Loadout, LoadoutChange (+11 more)

### Community 16 - "context-view.js"
Cohesion: 0.26
Nodes (15): renderContext(), renderDashboard(), renderSidebar(), describeChange(), estimateTokens(), formatDiff(), formatReport(), meter() (+7 more)

### Community 17 - "lazy-mcp.test.mjs"
Cohesion: 0.25
Nodes (12): code(), countLoaded(), countUsed(), createLazyMcp(), HOLD_AFTER_SESSIONS, readHeld(), readUsage(), resolveServer() (+4 more)

### Community 18 - "loadout.test.mjs"
Cohesion: 0.20
Nodes (10): formatHistory(), formatWhen(), isSnapshot(), isTrendPoint(), rememberSnapshot(), signed(), sparkline(), trendOf() (+2 more)

### Community 19 - "baseTokensOf"
Cohesion: 0.20
Nodes (12): baseTokensOf(), describeChange(), findLevers(), formatDiff(), formatJson(), formatTrimPlan(), isConversation(), leverSteps() (+4 more)

### Community 20 - "lazy-mcp.ts"
Cohesion: 0.23
Nodes (14): code(), countLoaded(), countUsed(), createLazyMcp(), HeldState, HOLD_AFTER_SESSIONS, McpUsage, readHeld() (+6 more)

## Knowledge Gaps
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createLazyMcp()` connect `lazy-mcp.test.mjs` to `register.js`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Should `mod-api.d.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Why does `register()` connect `register.js` to `utils.js`, `loadout.js`, `context-view.js`, `lazy-mcp.test.mjs`, `loadout.test.mjs`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Should `context.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Why does `register()` connect `register.ts` to `register.ts`, `loadout.ts`, `context-view.ts`, `baseTokensOf`, `lazy-mcp.ts`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Should `loadout.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10507246376811594 - nodes in this community are weakly interconnected._
- **Should `register.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1383399209486166 - nodes in this community are weakly interconnected._