Objective: make Cognita usable by teams and security-minded users (policy in the repo, deeper Access, supply chain, CI/CHANGELOG/compat, cost in dollars).
Branch: `feat/serious-use` (from `feat/lazy-mcp`, v0.8.0). Delivery: ask-on-risk. Runner: `npm test` in `claude-code-tui/` (node --test + `claude plugin test`).

## Specs

- **S1 · Policy in the repo.** User text: "La regla vive en el repo. Hoy el presupuesto y las alertas se configuran con variables de entorno, en cada máquina. Si tu compañero no las tiene, tiene otra regla. Un archivo `.cognita.json` commiteado en el repo hace que todo el equipo use la misma, igual que un `.editorconfig`. Por ejemplo: \"en este proyecto, leer `.env` tiene que pedir permiso\"."
  - `.cognita.json` at the project root holds the budget, the growth alert and the required verdict per action. It wins over the env vars when both are set (env vars stay as the per-machine fallback).
  - Access reports each policy violation (for example: policy says reading `.env` must ask, permission system says it runs without asking).
  - An invalid file is reported, never crashes the plugin.
- **S2 · More actions in Access.** User text: "Probar más acciones en Access. Hoy prueba 8 acciones de ejemplo fijas. Le faltan: Los comandos propios de cada equipo, como `terraform apply`, `kubectl delete` o `npm publish`. Las herramientas de los servidores MCP. Las lista, pero no pregunta si corren sin pedir permiso. Reglas demasiado amplias, como `Bash(*)`, que permite cualquier comando, y hoy no las marca."
  - Custom actions declared in `.cognita.json` are probed with the same `$.tool.check` path as the built-in samples.
  - Every loaded MCP tool is probed; the report lists, per server, which ones run without asking (no tool is executed).
  - Allow rules that are too broad (`Bash`, `Bash(*)`, `Bash(:*)`, `Write(*)`, `mcp__server` whole-server allows, etc.) are flagged with the source that defines them.
- **S3 · Supply chain.** User text: "Saber de dónde viene lo que corre (supply chain). Cadena de suministro quiere decir \"de dónde sale el código que se ejecuta en tu máquina\". Cognita dice \"hay 14 hooks corriendo\", pero no dice cuáles ni qué hacen. Un servidor MCP tipo `npx paquete@latest` baja código de internet cada vez y sin versión fija, así que puede cambiar mañana sin que te enteres. Cognita debería listar cada comando, su origen y si está fijado a una versión."
  - New `/cognita supply` (and `json`): every hook command and every MCP server command/URL, its origin (settings source or plugin + marketplace), and whether it is pinned to a version. Unpinned `npx`/`uvx`/`bunx`/`pipx` packages and `@latest` are flagged; remote URLs are listed as remote.
- **S4 · CI, CHANGELOG, compatibility.** User text: "CI: un robot que corre los tests solo, en cada cambio. Hoy los corrés a mano. CHANGELOG: un archivo con la lista de cambios por versión. Sin él, nadie sabe qué cambió. Compatibilidad: Cognita usa APIs del motor de plugins de Claude Code. Si cambian una, Cognita puede romperse. Un CI que pruebe contra la última versión de Claude Code te avisa antes que al usuario."
  - GitHub Actions workflow on push and PR: ubuntu, macOS and Windows; `npm ci`, build, unit tests, `claude plugin validate`, and `claude plugin test` against the latest Claude Code.
  - `CHANGELOG.md` with every version from 0.1.0 to 0.8.0 (from HACKATHON.md) in Keep a Changelog format.
  - At load, Cognita checks the engine APIs it needs; when one is missing it says which feature is off and why, instead of failing silently.
- **S5 · Cost in dollars.** User text: "lo de mostrar dolares" (from: "Costo real en dólares por proyecto y por día en el historial. Hoy el historial guarda solo los tokens que se cargan al arrancar.")
  - The session cost in USD is stored per project; `/cognita history` shows spend per session, per day and the project total. A `/cognita cost [json]` view summarizes it.

## Tasks

| ID | Specs | Route | Status | Commit |
| --- | --- | --- | --- | --- |
| T1 | S1, S2 | delegated (sonnet, worktree; parallel unit) | pending | |
| T2 | S3 | delegated (sonnet, worktree; parallel unit) | pending | |
| T3 | S4 | delegated (sonnet, worktree; parallel unit) | pending | |
| T4 | S5 | delegated (sonnet, worktree; parallel unit) | pending | |
| T5 | all | inline: merge, full suite, docs, version 0.9.0, HACKATHON log | pending | |

## Log

- L1 (2026-11-22, user): "solo quiero modificar esto y lo de mostrar dolares genera subagents para completarlo" (pasted items 2, 3, 4 and 5 of the gap list).
- L2: Writer trigger (a): four independent units launched together, each several files; all touch `src/register.ts`, so each runs in an isolated worktree and the parent merges. Engram mirror pending (tools unavailable in this session).
