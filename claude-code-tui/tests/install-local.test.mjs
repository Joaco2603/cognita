import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('local install copies all files imported by the hooks module', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'workspace-dashboard-home-'))

  try {
    const result = spawnSync(process.execPath, ['scripts/install-local.mjs'], {
      cwd: projectRoot,
      env: { ...process.env, HOME: home, USERPROFILE: home },
      encoding: 'utf8',
    })

    assert.equal(result.status, 0, result.stderr)

    const installedHooks = path.join(home, '.claude', 'skills', 'workspace-dashboard', 'hooks')
    for (const file of ['register.js', 'agents-view.js', 'context-view.js', 'dashboard-view.js', 'loadout.js', 'utils.js']) {
      await readFile(path.join(installedHooks, file), 'utf8')
    }
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
