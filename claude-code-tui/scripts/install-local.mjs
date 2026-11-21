import { access, copyFile, cp, mkdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const installRoot = path.join(homedir(), '.claude', 'skills', 'workspace-dashboard')
const manifestPath = path.join(installRoot, '.claude-plugin', 'plugin.json')

try {
  await access(manifestPath)
  const installedManifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (installedManifest.name !== 'workspace-dashboard') {
    throw new Error(`Refusing to overwrite another plugin at ${installRoot}`)
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}

await mkdir(path.join(installRoot, '.claude-plugin'), { recursive: true })
await copyFile(
  path.join(pluginRoot, '.claude-plugin', 'plugin.json'),
  manifestPath,
)
await cp(path.join(pluginRoot, 'hooks'), path.join(installRoot, 'hooks'), { recursive: true })

process.stdout.write(`Installed Workspace Dashboard to ${installRoot}\n`)
process.stdout.write('Start Claude Code normally, then run /inspector.\n')
