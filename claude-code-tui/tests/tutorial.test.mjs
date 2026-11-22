// Unit tests for `/cognita tutorial`, run against the built hooks.
import assert from 'node:assert/strict'
import test from 'node:test'
import { formatTutorial, TUTORIAL_STEPS } from '../hooks/tutorial.js'

test('the tutorial names every command a user can run', () => {
  const text = formatTutorial()
  for (const command of ['/cognita report', '/cognita access', '/cognita supply', '/cognita trim', '/cognita trim --apply', '/cognita hold', '/cognita connect', '/cognita release', '/cognita history', '/cognita cost', '/cognita doctor', '/cognita help', '/cognita tutorial']) {
    assert.ok(text.includes(`\`${command}`), `missing ${command}`)
  }
})

test('the tutorial starts with the report and orders the steps', () => {
  const text = formatTutorial()
  assert.ok(text.indexOf('/cognita report') < text.indexOf('/cognita trim'))
  assert.equal(TUTORIAL_STEPS[0].commands[0].command, '/cognita report')
})

test('every step has a question and at least one command', () => {
  for (const step of TUTORIAL_STEPS) {
    assert.ok(step.question.length > 0)
    assert.ok(step.commands.length > 0)
  }
})
