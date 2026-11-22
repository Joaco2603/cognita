// Installs this checkout as a local plugin: Claude Code loads every plugin
// under ~/.claude/skills/<name>/ at the next session start (as cognita@skills-dir).
import { access, copyFile, cp, mkdir, readFile, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const NAME = 'cognita'
const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const skillsRoot = path.join(homedir(), '.claude', 'skills')
const installRoot = path.join(skillsRoot, NAME)

async function readManifestName(root) {
  try {
    const manifest = JSON.parse(await readFile(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8'))
    return manifest.name
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

const installedName = await readManifestName(installRoot)
if (installedName !== undefined && installedName !== NAME) {
  throw new Error(`Refusing to overwrite another plugin at ${installRoot}`)
}

// Earlier versions installed as "workspace-dashboard"; two copies would both
// register /inspector, so the old one goes.
const legacyRoot = path.join(skillsRoot, 'workspace-dashboard')
if (await readManifestName(legacyRoot) === 'workspace-dashboard') {
  await rm(legacyRoot, { recursive: true, force: true })
  process.stdout.write(`Removed the previous version at ${legacyRoot}\n`)
}

await rm(path.join(installRoot, 'hooks'), { recursive: true, force: true })
await mkdir(path.join(installRoot, '.claude-plugin'), { recursive: true })
await copyFile(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), path.join(installRoot, '.claude-plugin', 'plugin.json'))
await cp(path.join(pluginRoot, 'hooks'), path.join(installRoot, 'hooks'), { recursive: true })
await access(path.join(installRoot, 'hooks', 'register.js'))

process.stdout.write(`Installed Cognita to ${installRoot}\n`)
process.stdout.write('Start a new Claude Code session, then run /cognita.\n')
