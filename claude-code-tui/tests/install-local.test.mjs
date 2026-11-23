import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('local install copies all files imported by the hooks module', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'cognita-home-'))

  try {
    const result = spawnSync(process.execPath, ['scripts/install-local.mjs'], {
      cwd: projectRoot,
      env: { ...process.env, HOME: home, USERPROFILE: home },
      encoding: 'utf8',
    })

    assert.equal(result.status, 0, result.stderr)

    const installedHooks = path.join(home, '.claude', 'skills', 'cognita', 'hooks')
    for (const file of ['core/register.js', 'features/access/access.js', 'features/access/access-view.js', 'features/agents/agents-view.js', 'features/context/context-view.js', 'features/dashboard/dashboard-view.js', 'core/loadout.js', 'core/theme.js', 'core/utils.js']) {
      await readFile(path.join(installedHooks, file), 'utf8')
    }
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
