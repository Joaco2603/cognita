---
name: file-size-discipline
description: "Trigger: file too long, 200 lines, 300 lines, split file, oversized source. Keep code files around 200–300 lines through cohesive decomposition."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## Activation Contract

Use when creating or modifying source code and a file approaches or exceeds 200–300 lines, or when asked to split an oversized code file. This is a maintainability guideline, not a hard limit for generated files, schemas, fixtures, or documentation.

## Hard Rules

- Prefer files of roughly 200–300 lines; treat 300 as a review signal, not a mechanical cap.
- Count meaningful code lines consistently with the project's conventions; do not game the count by minifying, deleting useful comments, or moving code into opaque blobs.
- Split by responsibility and cohesion. Keep related behavior, types, and tests discoverable; avoid one-line wrappers and artificial fragmentation.
- Preserve public APIs and behavior unless the user explicitly authorizes a change. Update imports, exports, docs, and tests when needed.
- Inspect neighboring files and reuse established project structure before introducing a new layout.

## Decision Gates

| Situation | Action |
|---|---|
| File under 200 lines | Keep structure unless a real cohesion problem exists. |
| File 200–300 lines | Review responsibility boundaries; split only when it improves clarity. |
| File over 300 lines | Identify cohesive units and propose or implement a behavior-preserving split. |
| A split would scatter tightly coupled logic or obscure flow | Keep it together and document the reason; maintainability outweighs the numeric target. |

## Execution Steps

1. Confirm the file type, current size, and project conventions.
2. Identify independent responsibilities and their dependencies before moving code.
3. Choose names and module boundaries that communicate responsibility; avoid generic `utils` dumping grounds.
4. Move code with minimal behavior changes, preserving visibility, initialization order, and dependency direction.
5. Run focused tests and relevant checks; inspect the diff for accidental API or behavior changes.
6. Report the resulting file sizes and any deliberate exception to the target.

## Output Contract

Summarize the files split or retained, resulting approximate line counts, checks run, and rationale for any file remaining above 300 lines.

## References

Follow the repository's existing architecture, style guide, and test conventions.
