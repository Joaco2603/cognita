import assert from 'node:assert/strict'
import test from 'node:test'
import { parsePolicy, policyViolations, mergeAlerts, customProbes, policyReadFailure, POLICY_FILE } from '../hooks/policy.js'

test('parsePolicy reads budget (number or "30k"), alert and require', () => {
  const { policy, warnings } = parsePolicy(JSON.stringify({ budget: '30k', alert: 1500, require: { env: 'ask', delete: 'deny' } }))
  assert.deepEqual(warnings, [])
  assert.equal(policy.budget, 30000)
  assert.equal(policy.alert, 1500)
  assert.deepEqual(policy.require, { env: 'ask', delete: 'deny' })
  assert.equal(POLICY_FILE, '.cognita.json')
})

test('parsePolicy reports invalid JSON and wrong shapes as warnings, never throws', () => {
  const broken = parsePolicy('{ nope')
  assert.equal(broken.warnings.length, 1)
  assert.match(broken.warnings[0], /\.cognita\.json/)
  assert.deepEqual(broken.policy.require, {})
  const wrong = parsePolicy(JSON.stringify({ budget: 'lots', require: { env: 'maybe' }, actions: 'x' }))
  assert.equal(wrong.policy.budget, undefined)
  assert.deepEqual(wrong.policy.require, {})
  assert.equal(wrong.warnings.length, 3)
  assert.equal(parsePolicy('[]').warnings.length, 1)
})

test('policy wins over env alert settings; env is the fallback', () => {
  assert.deepEqual(mergeAlerts({ budget: 5000, alert: 100, require: {}, actions: [] }, { budget: 9000, growth: 2000 }), { budget: 5000, growth: 100 })
  assert.deepEqual(mergeAlerts({ require: {}, actions: [] }, { budget: 9000, growth: 2000 }), { budget: 9000, growth: 2000 })
})

test('policyViolations: required verdict is a floor, stricter wins', () => {
  const probes = [
    { key: 'env', label: 'Read .env secrets', verdict: 'allow' },
    { key: 'push', label: 'Push to a git remote', verdict: 'ask' },
    { key: 'delete', label: 'Delete files (rm -rf)', verdict: 'deny' },
    { key: 'web', label: 'Fetch web pages', verdict: 'missing' },
  ]
  const policy = { require: { env: 'ask', push: 'ask', delete: 'ask', web: 'deny', ghost: 'ask' }, actions: [] }
  assert.deepEqual(policyViolations(policy, probes), ['Policy: Read .env secrets must ask; it runs without asking.'])
  assert.deepEqual(
    policyViolations({ require: { push: 'deny' }, actions: [] }, probes),
    ['Policy: Push to a git remote must be blocked; it asks first.'],
  )
})

test('policyViolations: a probe that could not be checked is reported, a missing tool is skipped', () => {
  const probes = [
    { key: 'env', label: 'Read .env secrets', verdict: 'unknown' },
    { key: 'delete', label: 'Delete files (rm -rf)', verdict: 'unknown' },
    { key: 'push', label: 'Push to a git remote', verdict: 'unknown' },
    { key: 'web', label: 'Fetch web pages', verdict: 'missing' },
  ]
  const policy = { require: { env: 'ask', delete: 'deny', push: 'allow', web: 'deny' }, actions: [] }
  assert.deepEqual(policyViolations(policy, probes), [
    'Policy: Read .env secrets must ask; it could not be checked.',
    'Policy: Delete files (rm -rf) must be blocked; it could not be checked.',
  ])
})

test('custom actions are validated and become probes', () => {
  const { policy, warnings } = parsePolicy(JSON.stringify({ actions: [
    { key: 'tf', label: 'Terraform apply', tool: 'Bash', input: { command: 'terraform apply' }, risky: true },
    { key: 'shell', label: 'dup of builtin', tool: 'Bash', input: {} },
    { label: 'no key', tool: 'Bash' },
  ] }))
  assert.equal(warnings.length, 2)
  const probes = customProbes(policy)
  assert.equal(probes.length, 1)
  assert.equal(probes[0].isRisky, true)
  assert.deepEqual(probes[0].input({ cwd: '/x', home: '/h' }), { command: 'terraform apply' })
})

test('policyReadFailure: an absent file is no policy, but a file that exists and could not be read is a warning', () => {
  assert.deepEqual(policyReadFailure(new Error('ENOENT'), false), [])
  const unreadable = policyReadFailure(new Error('EACCES: permission denied'), true)
  assert.equal(unreadable.length, 1)
  assert.match(unreadable[0], /\.cognita\.json exists but could not be read/)
  assert.match(unreadable[0], /not applied/)
  assert.match(unreadable[0], /EACCES/)
  const unknown = policyReadFailure(new TypeError('$.fs.read is not a function'), undefined)
  assert.equal(unknown.length, 1)
  assert.match(unknown[0], /could not check/i)
})
