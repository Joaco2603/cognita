---
name: rust-terminal-ui
description: "Trigger: TUI, terminal UI, Rust interface, Ratatui, Crossterm. Guide implementation of the project's terminal UI in Rust."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## Activation Contract

Use when designing, implementing, testing, or changing the project's terminal user interface.

## Hard Rules

- Implement the terminal presentation with Rust, Ratatui, and Crossterm.
- Keep rendering responsive: never wait for Claude Code processes, filesystem work, or other potentially slow I/O inside the render loop. Run slow work separately and expose progress or results to the UI.
- Treat performance as a measured requirement, not an automatic consequence of using Rust. Prefer Ratatui's normal diff-based rendering before adding custom optimization.
- Preserve existing interaction behavior unless the user authorizes a change.

## Decision Gates

| Situation | Action |
|---|---|
| UI action is immediate and local | Handle it in the normal event/update flow. |
| UI action may block on a process or I/O | Run it outside rendering and return status/results to the UI. |
| Responsiveness is uncertain | Measure a representative release build before optimizing. |

## Execution Steps

1. Keep application actions and UI state updates separate from drawing widgets.
2. Use Ratatui with Crossterm for terminal rendering and input.
3. Keep process and I/O work from blocking input or rendering; show progress while it runs.
4. Verify key interactions and test representative workloads in an optimized build; profile before adding performance complexity.

## Output Contract

Report the UI behavior changed, checks run, and any measured responsiveness bottleneck or remaining uncertainty.

## References

No additional project-specific references yet.
