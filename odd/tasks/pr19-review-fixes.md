Objective: fix the important bugs that the four-slice review of PR #19 (v0.9.0) found, one small commit per bug, each with its test.
Branch: `feat/serious-use`. Delivery: ask-on-risk (fixes land as small commits on the PR branch; push is the user's call). Runner: `npm run test:unit` and `claude plugin test` in `claude-code-tui/`.

## Specs

The user approved fixing the "important" findings of the review (L1). Each spec is one finding; its test must fail before the fix.

- **S1 · Supply chain: wrappers and shells.** `bash -c "npx -y pkg"`, `sh -c …`, `cmd /c npx -y pkg`, `env -i X=1 npx pkg`, `sudo -E npx pkg` and quoted env values (`FOO="a b" npx -y pkg`) are classified by the command they run, not as "local".
- **S2 · Supply chain: shell structure.** Newlines, `&`, shell keywords (`then`, `do`, `else`, `!`), `$(…)` and backticks no longer hide a runner; `curl … | sh` (also `| bash -s`, `| /bin/sh`, `| env bash`, `| python`, `| node`, `bash <(curl …)`, `sh -c "$(curl …)"`) is detected in `command` and `args`.
- **S3 · Supply chain: MCP command with spaces.** When `args` is non-empty, `command` is one argv[0] (no tokenizing), so `/Users/Jane Doe/.nvm/.../npx -y pkg` and `C:\Program Files\nodejs\npx.cmd` are seen as `npx`.
- **S4 · Supply chain: secrets and Markdown injection.** Values after `--token`, `--api-key`, `--password`, `--secret`, `*KEY=`/`*TOKEN=`/`*SECRET=`/`*PASSWORD=`, `Authorization` headers, URL query strings and URL userinfo are redacted in Markdown and JSON output; table cells collapse whitespace and cannot break the row or the code span.
- **S5 · Supply chain: Docker.** A tag is pinned only for a digest or an exact version (`1.2.3`); `:main`, `:stable`, `:1`, `:v1`, `:latest` are unpinned ("mutable tag"). Value-taking flags (`--link`, `--ulimit`, `--gpus`, `--device`, …) never get read as the image; `docker container run` and global flags before `run` are handled.
- **S6 · Access: unknown verdicts.** When any risky probe is `unknown`, Access does not say "No risky action runs without asking"; it says how many could not be checked.
- **S7 · Access: MCP probe limit.** MCP tools beyond the probe limit are reported as not checked, never silently dropped.
- **S8 · Policy: unknown verdicts.** A `require` rule whose probe is `unknown` produces a policy message saying it could not be checked.
- **S9 · Policy: typo keys.** A `require` key that is neither a built-in action nor a declared custom action produces a warning.
- **S10 · Cost: recorded with the status line off.** Cost is saved on `session.measure` whatever `CLAUDE_INSPECTOR_STATUSLINE` says.
- **S11 · Cost: unknown price.** When Claude Code reports `hasUnknownPrice`, the figure is shown as a lower bound ("at least") and marked partial, never shown as the exact spend.
- **S12 · Cost and lazy MCP: concurrent sessions.** Writes to the per-project stores re-read right before writing and merge, so two sessions in one project do not drop each other's entries; lazy MCP counts each session at most once per server (`loadedIn` does not grow when two sessions alternate).
- **S13 · Lazy MCP: names and hold/release.** Usage counters are keyed by the normalized server key (old stored data merges into it), and `hold`, `release` and `connect` are serialized so two quick clicks both stick.

## Tasks

| Id | Specs | Route | Status | Commits |
| --- | --- | --- | --- | --- |
| T1 | S1-S5 | delegated (parallel writer, worktree; disjoint `supply-chain.*`) | done | 201c315, 2dd001c, d1008bc, 553d2a6, 43f6822, 75afedf |
| T2 | S6-S9 | delegated (parallel writer, worktree; `access*`, `policy*`, MCP probe in `register.ts`) | done | e192a77, cbb7cdd, 8630614, 8c41b6c |
| T3 | S12 (lazy part), S13 | delegated (parallel writer, worktree; `lazy-mcp.*`) | done | f8a6553, 830ca29, a81714e, 94d1173 |
| T4 | S10, S11, S12 (cost part) | inline (parent; `cost.*`, `session.measure` in `register.ts`) | done | 69abbac, 8dcf363 |

Route evidence: T1-T3 are independent units with disjoint files, each several files and 100+ lines, launched together (Writer trigger a). T4 is small and touches `register.ts` far from T2's region; the parent writes it.

## Log

- L1 (2026-11-22, user): "Sí, arreglalos" — answer to "¿Arreglo los bugs importantes de #19 en commits chicos?", after "genera commits mas chiquitos y subagentes para revisar bien muchas lineas de codigo en pocos prs".
- L2: Review findings come from four read-only reviewers (lazy MCP, supply chain, policy/access, cost/wiring); the parent confirmed the main ones in the code. Minor findings (~25) are out of scope.
- L3: Engram mirror pending: Engram tools are not loaded in this session.
- L4: Writers worked in isolated worktrees from dcd10b3; their commits were cherry-picked onto `feat/serious-use` without conflicts. Each writer observed RED then GREEN per spec. Seam check after all picks: `npm run test:unit` 110/110, `claude plugin test` 36/36, `npm run validate` passed, hooks rebuilt with no diff.
- L5: Exceptions. S10 has no automated test: the plugin test kit cannot raise `session.measure` ("no implementation for session.measure"); the fix only moves the save out of the status-line branch (69abbac). S12 cost part needed no change: `saveCost` already reads the store right before it writes, inside its write chain. Across processes the store has no compare-and-set, so a small window remains for both cost and lazy MCP.
- L6: T1 caveats from the writer: `2>&1` yields a harmless `1` segment classified local; `env -S` and `timeout N` wrappers are not unwrapped. The S2 commit is ~200 lines.
- L7: Risk: item 4 (concurrency: lazy MCP serialization) and item 2 (secret redaction in supply output). An independent verifier was run on S12, S13, S4 and S1/S2.
- L8: Verifier verdicts: S13 pass (20 random-delay rounds of concurrent hold/release match the sequential outcome; a rejected write does not deadlock later calls), S12 lazy pass, S1/S2 pass. S4 blocker: `--key`, `--secret-key`, `--auth`, `--bearer`, `--cookie`, `--pat`, a quoted `"--token"` and JSON fields (`matcher`, names, unreadable paths) leaked. One correction batch (75afedf) fixed them; the recheck with the verifier's probe showed only the cases it called optional or contrived: `-t`/`-p` short flags (`-p` is also npx's package flag), a backslash-escaped `Authorization:Bearer\ X` and `--token=$(cat f) X`. Not fixed: `timeout N`, `nice -n N` and `xargs` prefixes still read as local (outside S1's list). Final checks: `npm run test:unit` 111/111, `claude plugin test` 36/36, `npm run validate` passed.
