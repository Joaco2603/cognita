// Team policy from `.cognita.json` at the project root: budget, growth alert,
// the verdict each action must have at least, and custom actions to probe.
// Pure parsing and checking; the file is read in register.ts.
import { parseTokens } from '../../core/loadout.js';
export const POLICY_FILE = '.cognita.json';
const STRICTNESS = { allow: 0, ask: 1, deny: 2 };
/** Keys of the built-in samples; a custom action may not reuse them. */
const BUILTIN_KEYS = new Set(['shell', 'edit', 'web', 'push', 'delete', 'env', 'ssh', 'outside']);
const emptyPolicy = () => ({ require: {}, actions: [] });
function amount(value) {
    if (value === undefined)
        return undefined;
    const parsed = typeof value === 'number' ? value : typeof value === 'string' ? parseTokens(value) : undefined;
    return parsed !== undefined && Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}
/** Parses the file text. Problems become warnings; this never throws. */
export function parsePolicy(text) {
    const policy = emptyPolicy();
    const warnings = [];
    const warn = (message) => warnings.push(`${POLICY_FILE}: ${message}`);
    let data;
    try {
        data = JSON.parse(text);
    }
    catch {
        warn('not valid JSON, ignored.');
        return { policy, warnings };
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        warn('expected a JSON object, ignored.');
        return { policy, warnings };
    }
    const file = data;
    for (const field of ['budget', 'alert']) {
        const value = amount(file[field]);
        if (value === null)
            warn(`"${field}" must be a token count such as 30000 or "30k".`);
        else if (value !== undefined)
            policy[field] = value;
    }
    if (file.require !== undefined) {
        const required = file.require;
        if (!required || typeof required !== 'object' || Array.isArray(required))
            warn('"require" must map an action key to allow, ask or deny.');
        else {
            for (const [key, verdict] of Object.entries(required)) {
                if (verdict === 'allow' || verdict === 'ask' || verdict === 'deny')
                    policy.require[key] = verdict;
                else
                    warn(`"require.${key}" must be allow, ask or deny.`);
            }
        }
    }
    if (file.actions !== undefined) {
        if (!Array.isArray(file.actions))
            warn('"actions" must be a list.');
        else {
            const seen = new Set();
            file.actions.forEach((entry, index) => {
                const item = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
                const { key, label, tool, input, risky } = item;
                if (typeof key !== 'string' || !key.trim() || typeof tool !== 'string' || !tool.trim()) {
                    warn(`actions[${index}] needs a "key" and a "tool"; skipped.`);
                }
                else if (BUILTIN_KEYS.has(key) || seen.has(key)) {
                    warn(`actions[${index}] reuses the key "${key}"; skipped.`);
                }
                else {
                    seen.add(key);
                    policy.actions.push({
                        key,
                        label: typeof label === 'string' && label.trim() ? label : key,
                        tool,
                        input: input && typeof input === 'object' && !Array.isArray(input) ? input : {},
                        isRisky: risky === true,
                    });
                }
            });
        }
    }
    // A typo in a key would switch a rule off without a word, so name it.
    const known = new Set([...BUILTIN_KEYS, ...policy.actions.map((action) => action.key)]);
    for (const key of Object.keys(policy.require)) {
        if (!known.has(key))
            warn(`"require.${key}" matches no built-in or custom action; the rule never applies.`);
    }
    return { policy, warnings };
}
/** The policy wins over the env settings; the env settings are the fallback. */
/**
 * Warnings for a policy read that failed. `fileListed` is whether the project
 * folder lists the file (undefined when that could not be checked). An absent
 * file is the usual case and means no policy; anything else must be visible,
 * so a team policy is never dropped silently.
 */
export function policyReadFailure(error, fileListed) {
    if (fileListed === false)
        return [];
    const reason = error instanceof Error ? error.message : String(error);
    if (fileListed === undefined) {
        return [`${POLICY_FILE}: could not check for it (${reason}); a team policy, if there is one, is not applied.`];
    }
    return [`${POLICY_FILE} exists but could not be read (${reason}); the team policy is not applied.`];
}
export function mergeAlerts(policy, env) {
    return { budget: policy.budget ?? env.budget, growth: policy.alert ?? env.growth };
}
/** The custom actions as probes, in the shape access.ts asks the permission system. */
export function customProbes(policy) {
    return policy.actions.map((action) => ({
        key: action.key,
        label: action.label,
        tool: action.tool,
        isRisky: action.isRisky,
        input: () => action.input,
    }));
}
const MUST = { allow: 'be allowed', ask: 'ask', deny: 'be blocked' };
const ACTUAL = { allow: 'runs without asking', ask: 'asks first', deny: 'is blocked' };
/** One sentence per action whose verdict is less strict than the policy requires. */
export function policyViolations(policy, probes) {
    const violations = [];
    for (const probe of probes) {
        const required = policy.require[probe.key];
        if (!required)
            continue;
        if (probe.verdict === 'unknown') {
            // A failed check proves nothing, so it cannot pass a rule that asks for more than "allow".
            if (required !== 'allow')
                violations.push(`Policy: ${probe.label} must ${MUST[required]}; it could not be checked.`);
            continue;
        }
        if (!(probe.verdict in STRICTNESS))
            continue;
        if (STRICTNESS[probe.verdict] < STRICTNESS[required]) {
            violations.push(`Policy: ${probe.label} must ${MUST[required]}; it ${ACTUAL[probe.verdict]}.`);
        }
    }
    return violations;
}
