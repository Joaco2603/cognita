# Graph Report - claude-ai-context  (2026-11-20)

## Corpus Check
- 15 files · ~6,193 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: (none) 3)

## Summary
- 74 nodes · 111 edges · 11 communities (6 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- register.ts
- package.json
- register.js
- compilerOptions
- install-local.mjs
- mod-api.d.ts
- dashboard.test.ts

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 9 edges
2. `renderAgents()` - 6 edges
3. `register()` - 6 edges
4. `renderAgents()` - 6 edges
5. `register()` - 6 edges
6. `basename()` - 5 edges
7. `formatTokenCount()` - 5 edges
8. `scripts` - 5 edges
9. `basename()` - 5 edges
10. `formatTokenCount()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `renderAgents()` --calls--> `basename()`  [EXTRACTED]
  claude-code-tui/hooks/agents-view.js → claude-code-tui/hooks/utils.js
- `renderAgents()` --calls--> `formatTokenCount()`  [EXTRACTED]
  claude-code-tui/hooks/agents-view.js → claude-code-tui/hooks/utils.js
- `renderAgents()` --calls--> `isActiveAgent()`  [EXTRACTED]
  claude-code-tui/hooks/agents-view.js → claude-code-tui/hooks/utils.js
- `register()` --calls--> `renderAgents()`  [EXTRACTED]
  claude-code-tui/hooks/register.js → claude-code-tui/hooks/agents-view.js
- `register()` --calls--> `renderSidebar()`  [EXTRACTED]
  claude-code-tui/hooks/register.js → claude-code-tui/hooks/dashboard-view.js

## Import Cycles
- None detected.

## Communities (11 total, 5 thin omitted)

### Community 0 - "register.ts"
Cohesion: 0.39
Nodes (11): renderAgents(), renderDashboard(), renderSidebar(), register(), AgentSubview, basename(), DashboardTab, formatTokenCount() (+3 more)

### Community 1 - "package.json"
Cohesion: 0.17
Nodes (12): devDependencies, typescript@5.9.3, name, private, scripts, build, install:local, test (+4 more)

### Community 2 - "register.js"
Cohesion: 0.47
Nodes (8): renderAgents(), renderDashboard(), renderSidebar(), register(), basename(), formatTokenCount(), isActiveAgent(), joinPath()

### Community 6 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, module, moduleResolution, noEmitOnError, outDir, rootDir, skipLibCheck, strict (+2 more)

### Community 7 - "install-local.mjs"
Cohesion: 0.25
Nodes (3): installRoot, manifestPath, pluginRoot

### Community 8 - "mod-api.d.ts"
Cohesion: 0.29
Nodes (6): AgentInfo, ModApi, ModEvent, ModHandler, ModOn, UiComponents

## Knowledge Gaps
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Not enough signal to generate questions. This usually means the corpus has no AMBIGUOUS edges, no bridge nodes, no INFERRED relationships, and all communities are tightly cohesive. Add more files or run with --mode deep to extract richer edges._