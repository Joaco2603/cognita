// Team policy from `.cognita.json` at the project root: budget, growth alert,
// the verdict each action must have at least, and custom actions to probe.
// Pure parsing and checking; the file is read in register.ts.

import { parseTokens, type AlertSettings } from './loadout.js'

export const POLICY_FILE = '.cognita.json'

/** The verdicts a policy can require. Stricter means asking more: allow < ask < deny. */
export type RequiredVerdict = 'allow' | 'ask' | 'deny'
const STRICTNESS: Record<RequiredVerdict, number> = { allow: 0, ask: 1, deny: 2 }

export type CustomAction = {
  key: string
  label: string
  tool: string
  input: Record<string, unknown>
  isRisky: boolean
}

export type Policy = {
  budget?: number
  alert?: number
  require: Record<string, RequiredVerdict>
  actions: CustomAction[]
}

export type PolicyLoad = { policy: Policy; warnings: string[] }

/** Keys of the built-in samples; a custom action may not reuse them. */
const BUILTIN_KEYS = new Set(['shell', 'edit', 'web', 'push', 'delete', 'env', 'ssh', 'outside'])

const emptyPolicy = (): Policy => ({ require: {}, actions: [] })

function amount(value: unknown): number | undefined | null {
  if (value === undefined) return undefined
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? parseTokens(value) : undefined
  return parsed !== undefined && Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null
}

/** Parses the file text. Problems become warnings; this never throws. */
export function parsePolicy(text: string): PolicyLoad {
  const policy = emptyPolicy()
  const warnings: string[] = []
  const warn = (message: string) => warnings.push(`${POLICY_FILE}: ${message}`)
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    warn('not valid JSON, ignored.')
    return { policy, warnings }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    warn('expected a JSON object, ignored.')
    return { policy, warnings }
  }
  const file = data as Record<string, unknown>

  for (const field of ['budget', 'alert'] as const) {
    const value = amount(file[field])
    if (value === null) warn(`"${field}" must be a token count such as 30000 or "30k".`)
    else if (value !== undefined) policy[field] = value
  }

  if (file.require !== undefined) {
    const required = file.require
    if (!required || typeof required !== 'object' || Array.isArray(required)) warn('"require" must map an action key to allow, ask or deny.')
    else {
      for (const [key, verdict] of Object.entries(required)) {
        if (verdict === 'allow' || verdict === 'ask' || verdict === 'deny') policy.require[key] = verdict
        else warn(`"require.${key}" must be allow, ask or deny.`)
      }
    }
  }

  if (file.actions !== undefined) {
    if (!Array.isArray(file.actions)) warn('"actions" must be a list.')
    else {
      const seen = new Set<string>()
      file.actions.forEach((entry, index) => {
        const item = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry as Record<string, unknown> : {}
        const { key, label, tool, input, risky } = item
        if (typeof key !== 'string' || !key.trim() || typeof tool !== 'string' || !tool.trim()) {
          warn(`actions[${index}] needs a "key" and a "tool"; skipped.`)
        } else if (BUILTIN_KEYS.has(key) || seen.has(key)) {
          warn(`actions[${index}] reuses the key "${key}"; skipped.`)
        } else {
          seen.add(key)
          policy.actions.push({
            key,
            label: typeof label === 'string' && label.trim() ? label : key,
            tool,
            input: input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {},
            isRisky: risky === true,
          })
        }
      })
    }
  }
  return { policy, warnings }
}

/** The policy wins over the env settings; the env settings are the fallback. */
/**
 * Warnings for a policy read that failed. `fileListed` is whether the project
 * folder lists the file (undefined when that could not be checked). An absent
 * file is the usual case and means no policy; anything else must be visible,
 * so a team policy is never dropped silently.
 */
export function policyReadFailure(error: unknown, fileListed: boolean | undefined): string[] {
  if (fileListed === false) return []
  const reason = error instanceof Error ? error.message : String(error)
  if (fileListed === undefined) {
    return [`${POLICY_FILE}: could not check for it (${reason}); a team policy, if there is one, is not applied.`]
  }
  return [`${POLICY_FILE} exists but could not be read (${reason}); the team policy is not applied.`]
}

export function mergeAlerts(policy: Pick<Policy, 'budget' | 'alert'>, env: AlertSettings): AlertSettings {
  return { budget: policy.budget ?? env.budget, growth: policy.alert ?? env.growth }
}

/** The custom actions as probes, in the shape access.ts asks the permission system. */
export function customProbes(policy: Policy): Array<{
  key: string
  label: string
  tool: string
  isRisky: boolean
  input: () => Record<string, unknown>
}> {
  return policy.actions.map((action) => ({
    key: action.key,
    label: action.label,
    tool: action.tool,
    isRisky: action.isRisky,
    input: () => action.input,
  }))
}

const MUST: Record<RequiredVerdict, string> = { allow: 'be allowed', ask: 'ask', deny: 'be blocked' }
const ACTUAL: Record<string, string> = { allow: 'runs without asking', ask: 'asks first', deny: 'is blocked' }

/** One sentence per action whose verdict is less strict than the policy requires. */
export function policyViolations(
  policy: Pick<Policy, 'require'>,
  probes: ReadonlyArray<{ key: string; label: string; verdict: string }>,
): string[] {
  const violations: string[] = []
  for (const probe of probes) {
    const required = policy.require[probe.key]
    if (!required) continue
    if (probe.verdict === 'unknown') {
      // A failed check proves nothing, so it cannot pass a rule that asks for more than "allow".
      if (required !== 'allow') violations.push(`Policy: ${probe.label} must ${MUST[required]}; it could not be checked.`)
      continue
    }
    if (!(probe.verdict in STRICTNESS)) continue
    if (STRICTNESS[probe.verdict as RequiredVerdict] < STRICTNESS[required]) {
      violations.push(`Policy: ${probe.label} must ${MUST[required]}; it ${ACTUAL[probe.verdict]}.`)
    }
  }
  return violations
}
