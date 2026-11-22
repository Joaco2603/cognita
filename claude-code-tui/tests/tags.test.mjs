// Unit tests for tagged items: extraction, attention share and retention.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  KEEP_MARKER,
  extractTagged,
  focusOf,
  formatRetention,
  formatTagged,
  mergeTagged,
  retentionAlert,
  retentionOf,
  taggedInstructions,
  withTaggedInstructions,
} from '../hooks/tags.js'

test('extracts the four tags, keeps explicit ids and numbers the rest by kind', () => {
  const items = extractTagged([
    'Plan: <decision>Use SQLite for the cache because it ships with the runtime</decision> and <constraint id="no-main">Do not touch main</constraint>',
    '<important>The deadline is tonight</important> <open>Write the docs</open> <decision>Keep the API stable</decision> <note>ignored</note>',
  ])
  assert.deepEqual(items.map((item) => [item.id, item.kind]), [
    ['d1', 'decision'],
    ['no-main', 'constraint'],
    ['i1', 'important'],
    ['o1', 'open'],
    ['d2', 'decision'],
  ])
  assert.equal(items[1].text, 'Do not touch main')
  assert.equal(items[1].words, 4)
})

test('an explicit id is never reused by an automatic one', () => {
  const items = extractTagged(['<decision id="d1">First</decision> <decision>Second</decision>'])
  assert.deepEqual(items.map((item) => item.id), ['d1', 'd2'])
})

test('mergeTagged keeps items the transcript no longer holds, newest text wins', () => {
  const merged = mergeTagged(extractTagged(['<decision>Old</decision> <open>Docs</open>']), extractTagged(['<decision>New text</decision>']))
  assert.deepEqual(merged.map((item) => [item.id, item.text]), [['d1', 'New text'], ['o1', 'Docs']])
})

test('focus weighs words by importance and flags short important items crowded out', () => {
  const items = extractTagged([
    `<constraint>Do not touch main</constraint> <open>${Array.from({ length: 200 }, () => 'detail').join(' ')}</open> <decision>Use SQLite here</decision>`,
  ])
  const focus = focusOf(items, 100000)
  const byId = Object.fromEntries(focus.items.map((item) => [item.id, item]))
  const total = focus.items.reduce((sum, item) => sum + item.focus, 0)
  assert.ok(Math.abs(total - 100) < 0.01)
  assert.ok(byId.o1.focus > byId.c1.focus)
  assert.equal(byId.c1.isCrowded, true)
  assert.equal(byId.d1.isCrowded, false, 'only important and constraint items are flagged')
  assert.equal(byId.c1.weight, 1)
  assert.equal(byId.o1.weight, 0.5)
  assert.ok(byId.o1.windowShare > 0 && byId.o1.windowShare < 1)
  assert.equal(focus.crowded.map((item) => item.id).join(), 'c1')
})

test('a single tagged item is never crowded out', () => {
  assert.equal(focusOf(extractTagged(['<important>Ship tonight</important>']), 1000).crowded.length, 0)
})

test('the compaction instructions list every item with its id, once', () => {
  const items = extractTagged(['<decision>Use SQLite</decision> <constraint>Do not touch main</constraint>'])
  const text = taggedInstructions(items)
  assert.ok(text.startsWith(KEEP_MARKER))
  assert.match(text, /\[d1\] decision: Use SQLite/)
  assert.match(text, /\[c1\] constraint: Do not touch main/)
  const once = withTaggedInstructions('Keep the plan.', items)
  assert.equal(withTaggedInstructions(once, items), once)
  assert.equal(withTaggedInstructions('Keep the plan.', []), 'Keep the plan.')
  assert.equal(withTaggedInstructions(undefined, items), text)
})

test('retention: kept with the id, rewritten when few words survive, lost when gone', () => {
  const items = extractTagged(['<decision>Use SQLite for the cache</decision> <constraint>Do not touch main</constraint> <open>Write the docs for the API</open>'])
  const summary = 'Summary.\n- [d1] decision: Use SQLite for the cache.\n- [o1] Docs pending.\nOther notes.'
  const retention = retentionOf(items, summary)
  const byId = Object.fromEntries(retention.items.map((item) => [item.id, item]))
  assert.equal(byId.d1.status, 'kept')
  assert.equal(byId.o1.status, 'rewritten')
  assert.ok(byId.o1.overlap < 60)
  assert.equal(byId.c1.status, 'lost')
  assert.deepEqual([retention.kept, retention.rewritten, retention.lost], [1, 1, 1])
})

test('an item whose id was dropped but whose words all survive still counts as kept', () => {
  const items = extractTagged(['<constraint>Do not touch main</constraint>'])
  assert.equal(retentionOf(items, 'Remember: do not touch main, ever.').items[0].status, 'kept')
})

test('the retention toast names what was lost or rewritten, and stays quiet when all is kept', () => {
  const items = extractTagged(['<decision>Use SQLite for the cache</decision> <constraint>Do not touch main</constraint>'])
  const alert = retentionAlert(retentionOf(items, '[d1] Use SQLite for the cache'))
  assert.equal(alert, 'Compaction kept 1 of 2 tagged items. Lost: c1 (constraint) "Do not touch main". Run /cognita pressure for details.')
  assert.equal(retentionAlert(retentionOf(items, '[d1] Use SQLite for the cache [c1] Do not touch main')), undefined)
})

test('the report lists each item with its share and the last retention', () => {
  const items = extractTagged(['<constraint>Do not touch main</constraint> <open>Write the docs</open>'])
  const text = formatTagged(focusOf(items, 200000)).join('\n')
  assert.match(text, /### Tagged items \(estimate\)/)
  assert.match(text, /\| c1 \| constraint \| 4 \| /)
  const retention = formatRetention(retentionOf(items, '[c1] Do not touch main')).join('\n')
  assert.match(retention, /kept 1 of 2/)
  assert.match(retention, /o1 \(open\): lost/)
  assert.equal(formatTagged(focusOf([], 1000)).length, 0)
})

test('after a compaction, a new tagged item never takes the id of one kept from before', () => {
  const before = extractTagged(['<decision>Use Postgres</decision>'])
  // The compaction dropped the prompt that held d1; a new decision arrives.
  const after = extractTagged(['<decision>Ship on Friday</decision>'], before)
  assert.deepEqual(after.map((item) => [item.id, item.text]), [['d2', 'Ship on Friday']])
  const merged = mergeTagged(before, after)
  assert.deepEqual(merged.map((item) => [item.id, item.text]), [['d1', 'Use Postgres'], ['d2', 'Ship on Friday']])
})

test('an item seen before keeps its id when the prompts are read again', () => {
  const before = extractTagged(['<decision>Use Postgres</decision> <open>Docs</open>'])
  const again = extractTagged(['<decision>Use Postgres</decision> <open>Docs</open> <decision>Ship on Friday</decision>'], before)
  assert.deepEqual(again.map((item) => item.id), ['d1', 'o1', 'd2'])
})
