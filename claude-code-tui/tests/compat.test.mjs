// Unit tests for the engine API compatibility check, run against the built hooks.
import assert from 'node:assert/strict'
import test from 'node:test'
import { REQUIREMENTS, checkCompatibility, probeEngine, compatLine, compatToast, formatDoctor } from '../hooks/compat.js'

/** A probe record where every probed API exists. */
function fullProbes() {
  return Object.fromEntries(REQUIREMENTS.filter((entry) => entry.probed).map((entry) => [entry.api, true]))
}

test('all APIs present: nothing missing', () => {
  const report = checkCompatibility(fullProbes())
  assert.deepEqual(report.missing, [])
  assert.equal(report.ok, true)
  assert.equal(compatToast(report), undefined)
  assert.match(compatLine(report), /^Compatibility: OK/)
})

test('one API missing: names the feature it powers', () => {
  const api = fullProbes()
  api['$.tool.check'] = false
  const report = checkCompatibility(api)
  assert.equal(report.ok, false)
  assert.equal(report.missing.length, 1)
  assert.equal(report.missing[0].api, '$.tool.check')
  assert.match(report.missing[0].feature, /Access/)
  assert.equal(
    compatToast(report),
    'Cognita: Access is off — this Claude Code has no $.tool.check. Update Claude Code.',
  )
  assert.match(compatLine(report), /Access/)
})

test('non-object input: everything missing, never throws', () => {
  for (const input of [undefined, null, 42, 'x', () => 1]) {
    const report = checkCompatibility(input)
    assert.equal(report.missing.length, REQUIREMENTS.length)
    assert.equal(report.ok, false)
  }
})

test('APIs with side effects are assumed present, not reported missing', () => {
  const report = checkCompatibility(fullProbes())
  assert.ok(REQUIREMENTS.some((entry) => !entry.probed))
  assert.deepEqual(report.missing, [])
})

test('probeEngine: a missing API is false, a failing one still exists', async () => {
  const $ = {
    tool: { list: async () => [], check: async () => { throw new Error('denied') } },
    session: { id: async () => 'x' },
  }
  const found = await probeEngine($)
  assert.equal(found['$.tool.list'], true)
  assert.equal(found['$.tool.check'], true)
  assert.equal(found['$.session.id'], true)
  assert.equal(found['$.settings.read'], false)
  assert.equal(found['$.store.get'], false)
  assert.equal(checkCompatibility(found).ok, false)
})

test('doctor lists every requirement and the version', () => {
  const api = fullProbes()
  api['$.settings.read'] = false
  const text = formatDoctor(checkCompatibility(api), '2.1.330')
  assert.match(text, /2\.1\.330/)
  for (const { api: path } of REQUIREMENTS) assert.ok(text.includes(path), path)
  assert.match(text, /missing/i)
  assert.match(formatDoctor(checkCompatibility(fullProbes()), undefined), /unknown/i)
})
