import type { Lever } from './loadout.js'

/** What `/cognita trim --apply` needs from the host, so it can be tested without one. */
export type TrimIo = {
  /** Runs a command by argument vector (no shell). */
  run: (argv: readonly string[]) => Promise<{ exitCode: number; stderr: string }>
  /** Holds an MCP server for this project, as `/cognita hold` does. */
  hold: (server: string) => Promise<string>
}

/** `/cognita trim --apply`, with or without the dashes. */
export function wantsApply(options: ReadonlySet<string>): boolean {
  return options.has('--apply') || options.has('apply')
}

/** A plugin name only: it must not be able to pass as a flag to the CLI. */
const PLUGIN_NAME = /^[A-Za-z0-9][A-Za-z0-9._@-]*$/

type Outcome = { line: string; freed: number }

async function disablePlugin(lever: Lever, io: TrimIo): Promise<Outcome> {
  if (!PLUGIN_NAME.test(lever.target)) {
    return { line: `- Skipped \`${lever.target}\`: refused, not a plugin name, so nothing was run.`, freed: 0 }
  }
  try {
    const result = await io.run(['claude', 'plugin', 'disable', lever.target, '--scope', 'local'])
    if (result.exitCode !== 0) {
      const why = result.stderr.trim().split('\n')[0] || `exit code ${result.exitCode}`
      return { line: `- Could not disable plugin \`${lever.target}\`: ${why}`, freed: 0 }
    }
    return {
      line: `- Disabled plugin \`${lever.target}\` (frees ~${lever.tokens.toLocaleString('en-US')}). Undo: \`claude plugin enable ${lever.target} --scope local\``,
      freed: lever.tokens,
    }
  } catch (error) {
    return { line: `- Could not disable plugin \`${lever.target}\`: ${error instanceof Error ? error.message : 'the command failed'}`, freed: 0 }
  }
}

async function holdServer(lever: Lever, io: TrimIo): Promise<Outcome> {
  try {
    const message = await io.hold(lever.target)
    const isHeld = message.startsWith('Held ') || message.includes('already held')
    return {
      line: isHeld
        ? `- Held MCP server \`${lever.target}\` (frees ~${lever.tokens.toLocaleString('en-US')}). Undo: \`/cognita connect ${lever.target}\``
        : `- Could not hold \`${lever.target}\`: ${message}`,
      freed: isHeld ? lever.tokens : 0,
    }
  } catch {
    return { line: `- Could not hold MCP server \`${lever.target}\`.`, freed: 0 }
  }
}

/**
 * Applies the trim plan: disables each plugin for this project and holds each
 * MCP server. Instruction files are the user's own text, so they are listed
 * for editing by hand and never touched.
 */
export async function applyTrim(levers: readonly Lever[], io: TrimIo): Promise<string> {
  const actionable = levers.filter((lever) => lever.kind !== 'file')
  const files = levers.filter((lever) => lever.kind === 'file')
  if (actionable.length === 0 && files.length === 0) return 'Nothing to apply: no plugin or MCP server is worth trimming.'
  const lines = ['## Trim applied', '']
  let freed = 0
  if (actionable.length === 0) lines.push('Nothing to apply automatically.')
  for (const lever of actionable) {
    const outcome = lever.kind === 'plugin' ? await disablePlugin(lever, io) : await holdServer(lever, io)
    lines.push(outcome.line)
    freed += outcome.freed
  }
  if (files.length > 0) {
    lines.push('', 'Left for you to edit by hand (your own text, so Cognita never rewrites it):')
    for (const file of files) lines.push(`- \`${file.target}\`: frees ~${file.tokens.toLocaleString('en-US')}`)
  }
  lines.push('', `**Applied:** ~${freed.toLocaleString('en-US')} tokens less at each start. Both changes take effect from the next session in this project.`)
  return lines.join('\n')
}
