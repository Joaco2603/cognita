# Graph Report - claude-ai-context  (2026-11-22)

## Corpus Check
- 43 files · ~57,476 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 6, .woff2 1)

## Summary
- 463 nodes · 1022 edges · 23 communities (19 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4f80ac3b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- register.ts
- package.json
- access.ts
- compilerOptions
- build.mjs
- mod-api.d.ts
- context.test.ts
- loadout.ts
- register.js
- register.ts
- access.js
- context-view.ts
- live/hyperframes.json
- lazy-mcp.test.mjs
- demo/hyperframes.json
- renderOverview
- lazy-mcp.ts
- scripts
- scripts

## God Nodes (most connected - your core abstractions)
1. `renderPane()` - 18 edges
2. `renderPane()` - 18 edges
3. `runCommand()` - 16 edges
4. `runCommand()` - 16 edges
5. `renderContext()` - 13 edges
6. `renderContext()` - 13 edges
7. `register()` - 11 edges
8. `register()` - 11 edges
9. `createLazyMcp()` - 10 edges
10. `formatReport()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `renderOverview()` --indirect_call--> `isActiveAgent()`  [INFERRED]
  claude-code-tui/src/dashboard-view.ts → claude-code-tui/src/utils.ts
- `readAccess()` --calls--> `analyzeAccess()`  [EXTRACTED]
  claude-code-tui/hooks/register.js → claude-code-tui/hooks/access.js
- `runCommand()` --calls--> `formatAccess()`  [EXTRACTED]
  claude-code-tui/hooks/register.js → claude-code-tui/hooks/access.js
- `renderContext()` --calls--> `serverKey()`  [EXTRACTED]
  claude-code-tui/hooks/context-view.js → claude-code-tui/hooks/lazy-mcp.js
- `renderOverview()` --indirect_call--> `isActiveAgent()`  [INFERRED]
  claude-code-tui/hooks/dashboard-view.js → claude-code-tui/hooks/utils.js

## Import Cycles
- None detected.

## Communities (23 total, 4 thin omitted)

### Community 0 - "register.ts"
Cohesion: 0.21
Nodes (13): renderAgents(), describeChange(), formatDiff(), formatReport(), table(), AccessSubview, AgentSubview, basename() (+5 more)

### Community 1 - "package.json"
Cohesion: 0.15
Nodes (13): devDependencies, typescript@5.9.3, name, private, scripts, build, install:local, test (+5 more)

### Community 2 - "access.ts"
Cohesion: 0.10
Nodes (28): AccessInput, analyzeAccess(), capped(), CommandGroup, countHooks(), findFlags(), formatAccess(), HookGroup (+20 more)

### Community 6 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, module, moduleResolution, noEmitOnError, outDir, rootDir, skipLibCheck, strict (+2 more)

### Community 7 - "build.mjs"
Cohesion: 0.06
Nodes (37): installRoot, legacyRoot, pluginRoot, skillsRoot, projectRoot, bgm, box(), boxes (+29 more)

### Community 8 - "mod-api.d.ts"
Cohesion: 0.11
Nodes (17): AgentInfo, ContextAgent, ContextCategory, ContextMcpTool, ContextMemoryFile, ContextSkill, InstructionFile, ModApi (+9 more)

### Community 9 - "context.test.ts"
Cohesion: 0.10
Nodes (15): breakdown, lastSession, mockSession(), openContext(), pane, finishedAgent, mockSession(), openCognita() (+7 more)

### Community 11 - "loadout.ts"
Cohesion: 0.08
Nodes (32): AlertSettings, CHANGE_LABEL, findLevers(), formatHistory(), formatTrimPlan(), formatWhen(), IdleItem, isSnapshot() (+24 more)

### Community 12 - "register.js"
Cohesion: 0.06
Nodes (92): formatAccessJson(), riskyAllowed(), renderAccess(), VERDICT_COLORS, renderAgents(), renderContext(), renderOverview(), renderSidebar() (+84 more)

### Community 13 - "register.ts"
Cohesion: 0.13
Nodes (36): formatAccessJson(), renderSidebar(), renderTabStrip(), DEFAULT_GROWTH_ALERT, diffLoadout(), emptyUsage(), formatJson(), mcpServerOf() (+28 more)

### Community 14 - "access.js"
Cohesion: 0.18
Nodes (17): analyzeAccess(), capped(), countHooks(), findFlags(), formatAccess(), PROBES, readRuleSet(), record() (+9 more)

### Community 15 - "context-view.ts"
Cohesion: 0.17
Nodes (22): AccessReport, renderAccess(), VERDICT_COLORS, renderContext(), TAB_HINTS, TABS, estimateTokens(), Loadout (+14 more)

### Community 16 - "live/hyperframes.json"
Cohesion: 0.18
Nodes (10): authoringSkill, media, autoProxy, paths, assets, blocks, components, registry (+2 more)

### Community 17 - "lazy-mcp.test.mjs"
Cohesion: 0.25
Nodes (12): code(), countLoaded(), countUsed(), createLazyMcp(), HOLD_AFTER_SESSIONS, readHeld(), readUsage(), resolveServer() (+4 more)

### Community 18 - "demo/hyperframes.json"
Cohesion: 0.20
Nodes (9): authoringSkill, media, autoProxy, paths, assets, blocks, components, registry (+1 more)

### Community 19 - "renderOverview"
Cohesion: 0.38
Nodes (7): riskyAllowed(), renderOverview(), baseTokensOf(), isConversation(), startupAlert(), toSnapshot(), formatTokensShort()

### Community 20 - "lazy-mcp.ts"
Cohesion: 0.18
Nodes (17): code(), countLoaded(), countUsed(), createLazyMcp(), HeldState, HeldView, HOLD_AFTER_SESSIONS, LazyIo (+9 more)

### Community 21 - "scripts"
Cohesion: 0.22
Nodes (8): name, private, scripts, check, dev, publish, render, type

### Community 22 - "scripts"
Cohesion: 0.22
Nodes (8): name, private, scripts, check, dev, publish, render, type

## Knowledge Gaps
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createLazyMcp()` connect `lazy-mcp.test.mjs` to `register.js`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Should `access.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09852216748768473 - nodes in this community are weakly interconnected._
- **Why does `analyzeAccess()` connect `access.js` to `register.js`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Should `build.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.06290471785383904 - nodes in this community are weakly interconnected._
- **Why does `formatAccess()` connect `access.js` to `register.js`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **Should `mod-api.d.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Should `context.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1038961038961039 - nodes in this community are weakly interconnected._