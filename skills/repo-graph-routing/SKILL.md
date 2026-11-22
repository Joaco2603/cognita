---
name: repo-graph-routing
description: Always-on rules for any git repo and any subagent. Ensure a graphify knowledge graph exists (build it if missing), query it before reading code, and route models by task - opus for planning, sonnet for writing code, haiku for reading code. Applies to the main session and every spawned subagent.
---

# repo-graph-routing

Applies in every repo, to the main session and to every subagent it spawns.

## 1. Graph first

On the first code task in a repo (a `.git` dir or project root):

1. Check `graphify-out/graph.json`.
2. **Missing** -> build it before anything else, with the `graphify` skill (`/graphify .`):
   - Create `.graphifyignore` first (skip `.claude/`, `.cursor/`, `.impeccable/`, `node_modules/`, `dist/`, `build/`, `.next/`, `graphify-out/`). Only add dirs that exist.
   - Add `graphify-out/` to `.gitignore` if absent.
   - If the repo has >500 files, code is extracted free by AST; cap semantic extraction to real docs (`docs/`, READMEs, root `*.md`). Never send duplicated skill/agent folders or images to semantic extraction.
   - Semantic extraction subagents use **haiku**.
3. **Present** -> answer structure/relationship questions with `graphify query "<q>"`, `graphify path A B`, `graphify explain X` before `grep`/`Read`. After code changes run `graphify update .` (AST only, no tokens), or `/graphify . --update` when docs changed.
4. Never read the whole repo by hand when the graph can answer. Use `Read` only on the files the graph points to.

## 2. Model routing (hard rule)

| Work | Model | Agent |
|---|---|---|
| Planning, design, architecture, task breakdown, review of plans | **opus** | `Plan` or `general-purpose` with `model: "opus"` |
| Writing/editing code, tests, migrations, configs | **sonnet** | `general-purpose` with `model: "sonnet"` |
| Reading/searching code, summarizing files, graph extraction, log reading | **haiku** | `Explore` or `general-purpose` with `model: "haiku"` |

- Always set `model` explicitly on every `Agent` call. Never leave it to inherit.
- Subagents obey the same table: an opus planner delegates reading to haiku and writing to sonnet; a sonnet writer does not spawn opus.
- One tree per task, strict file ownership, so parallel agents never touch the same files. Shared files are integrated by the parent afterwards.
- Keep contexts small: give each subagent only its files and a short brief. Reading agents return conclusions, not file dumps.
- Quick one-off edits or lookups stay in the main session; do not spawn for trivia.

## 3. Prompt for every subagent

Include in each subagent brief:
> Repo has a graphify graph at `graphify-out/`. Query it (`graphify query "..."`) before grepping. Use model routing from `repo-graph-routing`.
