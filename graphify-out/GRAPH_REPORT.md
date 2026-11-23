# Graph Report - claude-ai-context  (2026-11-22)

## Corpus Check
- 69 files · ~107,458 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 6, .woff2 1)

## Summary
- 983 nodes · 2267 edges · 46 communities (42 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 14 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `69c56411`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- pressure.js
- package.json
- supply-chain.js
- compilerOptions
- build.mjs
- mod-api.d.ts
- context.test.ts
- register.ts
- loadout.js
- pressure.ts
- access.js
- loadout.ts
- live/hyperframes.json
- lazy-mcp.js
- demo/hyperframes.json
- dashboard-view.ts
- tags.ts
- scripts
- scripts
- register.js
- access.ts
- test
- supply-chain.ts
- cost.js
- refreshPressure
- lazy-mcp.ts
- tags.js
- cost.ts
- runCommand
- policy.js
- policy.ts
- renderPane
- context-view.ts
- renderPane
- compat.ts
- utils.ts
- classifySegment
- intro/hyperframes.json
- scripts
- analyzeSupplyChain
- formatSupplyChain
- classifyShellString

## God Nodes (most connected - your core abstractions)
1. `runCommand()` - 41 edges
2. `runCommand()` - 41 edges
3. `register()` - 24 edges
4. `register()` - 24 edges
5. `renderPane()` - 22 edges
6. `renderPane()` - 22 edges
7. `classifySegment()` - 14 edges
8. `classifySegment()` - 14 edges
9. `renderContext()` - 13 edges
10. `renderContext()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `renderOverview()` --indirect_call--> `isActiveAgent()`  [INFERRED]
  claude-code-tui/src/features/dashboard/dashboard-view.ts → claude-code-tui/src/core/utils.ts
- `renderContext()` --calls--> `estimateTokens()`  [EXTRACTED]
  claude-code-tui/hooks/features/context/context-view.js → claude-code-tui/hooks/core/loadout.js
- `register()` --calls--> `recordToolCall()`  [EXTRACTED]
  claude-code-tui/hooks/core/register.js → claude-code-tui/hooks/core/loadout.js
- `register()` --calls--> `recordSkillUse()`  [EXTRACTED]
  claude-code-tui/hooks/core/register.js → claude-code-tui/hooks/core/loadout.js
- `formatPressure()` --calls--> `meter()`  [EXTRACTED]
  claude-code-tui/hooks/features/pressure/pressure.js → claude-code-tui/hooks/core/loadout.js

## Import Cycles
- None detected.

## Communities (46 total, 4 thin omitted)

### Community 0 - "pressure.js"
Cohesion: 0.08
Nodes (44): trackPlan(), applyDesktopPlan(), applyPlanCall(), asText(), ATTENTION_CAPS, ATTENTION_WEIGHT, attentionOf(), COMPACT_FROM_PROMPTS (+36 more)

### Community 1 - "package.json"
Cohesion: 0.15
Nodes (13): devDependencies, typescript@5.9.3, name, private, scripts, build, install:local, test (+5 more)

### Community 2 - "supply-chain.js"
Cohesion: 0.08
Nodes (45): analyzeSupplyChain(), baseName(), cell(), classifyCommand(), classifyImage(), classifyNpmSpec(), classifyPythonSpec(), classifySegment() (+37 more)

### Community 6 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, module, moduleResolution, noEmitOnError, outDir, rootDir, skipLibCheck, strict (+2 more)

### Community 7 - "build.mjs"
Cohesion: 0.06
Nodes (37): installRoot, legacyRoot, pluginRoot, skillsRoot, projectRoot, bgm, box(), boxes (+29 more)

### Community 8 - "mod-api.d.ts"
Cohesion: 0.11
Nodes (18): AgentInfo, ContextAgent, ContextCategory, ContextMcpTool, ContextMemoryFile, ContextSkill, InstructionFile, ModApi (+10 more)

### Community 9 - "context.test.ts"
Cohesion: 0.06
Nodes (24): breakdown, lastSession, mockSession(), openContext(), pane, Usage, finishedAgent, mockSession() (+16 more)

### Community 11 - "register.ts"
Cohesion: 0.09
Nodes (44): diffLoadout(), emptyUsage(), formatJson(), isTrendPoint(), mcpServerOf(), measurePrompt(), recordSkillUse(), recordToolCall() (+36 more)

### Community 12 - "loadout.js"
Cohesion: 0.09
Nodes (44): baseTokensOf(), CHANGE_LABEL, DEFAULT_GROWTH_ALERT, describeChange(), diffLoadout(), findLevers(), formatDiff(), formatHistory() (+36 more)

### Community 13 - "pressure.ts"
Cohesion: 0.07
Nodes (39): trackPlan(), applyDesktopPlan(), applyPlanCall(), asText(), Attention, ATTENTION_CAPS, ATTENTION_WEIGHT, attentionOf() (+31 more)

### Community 14 - "access.js"
Cohesion: 0.08
Nodes (51): meter(), pluginSections(), ACCENT, BORDER, ERROR, keyHints(), OK, WARN (+43 more)

### Community 15 - "loadout.ts"
Cohesion: 0.09
Nodes (32): baseTokensOf(), CHANGE_LABEL, DEFAULT_GROWTH_ALERT, findLevers(), formatHistory(), formatTrimPlan(), formatWhen(), IdleItem (+24 more)

### Community 16 - "live/hyperframes.json"
Cohesion: 0.18
Nodes (10): authoringSkill, media, autoProxy, paths, assets, blocks, components, registry (+2 more)

### Community 17 - "lazy-mcp.js"
Cohesion: 0.22
Nodes (15): code(), countLoaded(), countUsed(), createLazyMcp(), HOLD_AFTER_SESSIONS, newest(), readHeld(), readUsage() (+7 more)

### Community 18 - "demo/hyperframes.json"
Cohesion: 0.20
Nodes (9): authoringSkill, media, autoProxy, paths, assets, blocks, components, registry (+1 more)

### Community 19 - "dashboard-view.ts"
Cohesion: 0.13
Nodes (29): Loadout, meter(), ACCENT, BORDER, ERROR, keyHints(), OK, WARN (+21 more)

### Community 20 - "tags.ts"
Cohesion: 0.09
Nodes (31): compactFromPane(), compactNow(), keepTagged(), readConversation(), recordCompaction(), retryPendingLater(), engramSaveTool(), promptsOf() (+23 more)

### Community 21 - "scripts"
Cohesion: 0.22
Nodes (8): name, private, scripts, check, dev, publish, render, type

### Community 22 - "scripts"
Cohesion: 0.22
Nodes (8): name, private, scripts, check, dev, publish, render, type

### Community 23 - "register.js"
Cohesion: 0.15
Nodes (30): emptyUsage(), mcpServerOf(), sinceBadge(), afterCommand(), blockquote(), checkPressure(), compactCommand(), compactFromPane() (+22 more)

### Community 24 - "access.ts"
Cohesion: 0.10
Nodes (28): AccessInput, analyzeAccess(), BroadRule, CommandGroup, countHooks(), findBroadRules(), findFlags(), groupMcpAccess() (+20 more)

### Community 25 - "test"
Cohesion: 0.08
Nodes (25): run, jobs, test, os, name, on, pull_request, push (+17 more)

### Community 26 - "supply-chain.ts"
Cohesion: 0.09
Nodes (24): cell(), Classification, clip(), codeCell(), DOCKER_GLOBAL_VALUE_FLAGS, DOCKER_VALUE_FLAGS, DOWNLOAD_PIPES, HookEntry (+16 more)

### Community 27 - "cost.js"
Cohesion: 0.18
Nodes (20): spendWarning(), atLeast(), budgetStatus(), budgetWarning(), COST_LIMIT, COST_UNAVAILABLE, costJson(), costsOf() (+12 more)

### Community 28 - "refreshPressure"
Cohesion: 0.12
Nodes (24): afterCommand(), blockquote(), checkPressure(), compactCommand(), readWindow(), refreshPressure(), sendCommand(), submitNow() (+16 more)

### Community 29 - "lazy-mcp.ts"
Cohesion: 0.16
Nodes (21): McpServerLoad, code(), countLoaded(), countUsed(), createLazyMcp(), HeldState, HeldView, HOLD_AFTER_SESSIONS (+13 more)

### Community 30 - "tags.js"
Cohesion: 0.17
Nodes (19): estimateTokens(), countWords(), escape(), extractTagged(), flat(), focusOf(), formatRetention(), formatTagged() (+11 more)

### Community 31 - "cost.ts"
Cohesion: 0.16
Nodes (18): atLeast(), BudgetStatus, budgetStatus(), COST_LIMIT, COST_UNAVAILABLE, CostEntry, costJson(), CostView (+10 more)

### Community 32 - "runCommand"
Cohesion: 0.19
Nodes (17): attempt(), checkCompatibility(), compatLine(), compatToast(), featuresOf(), formatDoctor(), isMissingApi(), probeEngine() (+9 more)

### Community 33 - "policy.js"
Cohesion: 0.16
Nodes (16): parseTokens(), probeMcpTools(), readAccess(), readAlertSettings(), readPolicy(), ACTUAL, amount(), BUILTIN_KEYS (+8 more)

### Community 34 - "policy.ts"
Cohesion: 0.13
Nodes (18): AlertSettings, parseTokens(), readAlertSettings(), readPolicy(), ACTUAL, amount(), BUILTIN_KEYS, CustomAction (+10 more)

### Community 35 - "renderPane"
Cohesion: 0.23
Nodes (16): measurePrompt(), applyAccess(), fillMissing(), launchAgent(), openTab(), paneColumns(), promptCapture(), refreshAccess() (+8 more)

### Community 36 - "context-view.ts"
Cohesion: 0.24
Nodes (14): describeChange(), estimateTokens(), formatDiff(), formatReport(), LoadoutChange, LoadoutDiff, pluginSections(), PromptCapture (+6 more)

### Community 37 - "renderPane"
Cohesion: 0.26
Nodes (15): applyAccess(), fillMissing(), launchAgent(), openTab(), paneColumns(), refreshAccess(), refreshAgents(), refreshAll() (+7 more)

### Community 38 - "compat.ts"
Cohesion: 0.24
Nodes (12): attempt(), checkCompatibility(), compatLine(), CompatReport, compatToast(), featuresOf(), formatDoctor(), isMissingApi() (+4 more)

### Community 39 - "utils.ts"
Cohesion: 0.26
Nodes (9): AccessSubview, AgentSubview, basename(), ContextSubview, DashboardTab, isActiveAgent(), joinPath(), Workspace (+1 more)

### Community 40 - "classifySegment"
Cohesion: 0.24
Nodes (12): baseName(), classifyImage(), classifyNpmSpec(), classifyPythonSpec(), classifySegment(), dockerRunArgs(), firstPositional(), flagValue() (+4 more)

### Community 41 - "intro/hyperframes.json"
Cohesion: 0.20
Nodes (9): authoringSkill, media, autoProxy, paths, assets, blocks, components, registry (+1 more)

### Community 42 - "scripts"
Cohesion: 0.22
Nodes (8): name, private, scripts, check, dev, publish, render, type

### Community 43 - "analyzeSupplyChain"
Cohesion: 0.43
Nodes (8): analyzeSupplyChain(), classifyCommand(), describeMarketplace(), normalize(), pipesDownloadIntoShell(), readMcpServers(), record(), text()

### Community 44 - "formatSupplyChain"
Cohesion: 0.60
Nodes (5): capped(), formatAccess(), ruleLines(), table(), formatSupplyChain()

### Community 45 - "classifyShellString"
Cohesion: 0.50
Nodes (4): classifyShellString(), closingParen(), splitShell(), tokenize()

## Knowledge Gaps
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createLazyMcp()` connect `lazy-mcp.js` to `register.js`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **Should `pressure.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07510204081632653 - nodes in this community are weakly interconnected._
- **Why does `analyzeSupplyChain()` connect `supply-chain.js` to `runCommand`, `register.js`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **Should `supply-chain.js` be split into smaller, more focused modules?**
  _Cohesion score 0.0797872340425532 - nodes in this community are weakly interconnected._
- **Why does `analyzeAccess()` connect `access.js` to `policy.js`, `register.js`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **Should `build.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.0647342995169082 - nodes in this community are weakly interconnected._
- **Should `mod-api.d.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._