import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import chalk from 'chalk'

const HOOK_COMMAND = 'stackguard hook'
const STACKGUARD_MARKER = 'stackguard hook'

interface InstallHookOptions {
  global?: boolean
  uninstall?: boolean
}

interface ClaudeSettings {
  hooks?: {
    UserPromptSubmit?: HookGroup[]
    [event: string]: HookGroup[] | undefined
  }
  [key: string]: unknown
}

interface HookGroup {
  matcher?: string
  hooks?: HookHandler[]
}

interface HookHandler {
  type?: string
  command?: string
  timeout?: number
}

function settingsPath(opts: InstallHookOptions): string {
  if (opts.global) {
    return path.join(os.homedir(), '.claude', 'settings.json')
  }
  return path.join(process.cwd(), '.claude', 'settings.json')
}

async function readSettings(file: string): Promise<ClaudeSettings> {
  try {
    const raw = await fs.readFile(file, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ClaudeSettings
    }
    return {}
  } catch (err: any) {
    if (err && err.code === 'ENOENT') return {}
    throw err
  }
}

async function writeSettings(file: string, settings: ClaudeSettings): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, `${JSON.stringify(settings, null, 2)}\n`, 'utf-8')
}

/**
 * Pure helper: take an existing ClaudeSettings shape and return a new one
 * with the stackguard UserPromptSubmit hook added (if not already present).
 * Returns { settings, alreadyInstalled } so the caller can report status.
 */
export function addStackguardHook(input: ClaudeSettings): {
  settings: ClaudeSettings
  alreadyInstalled: boolean
} {
  const settings: ClaudeSettings = JSON.parse(JSON.stringify(input))
  if (!settings.hooks) settings.hooks = {}
  if (!settings.hooks.UserPromptSubmit) settings.hooks.UserPromptSubmit = []

  const groups = settings.hooks.UserPromptSubmit
  for (const group of groups) {
    if (!group.hooks) continue
    for (const handler of group.hooks) {
      if (handler.type === 'command' && handler.command?.includes(STACKGUARD_MARKER)) {
        return { settings, alreadyInstalled: true }
      }
    }
  }

  groups.push({
    matcher: '',
    hooks: [
      {
        type: 'command',
        command: HOOK_COMMAND,
      },
    ],
  })

  return { settings, alreadyInstalled: false }
}

/**
 * Pure helper: remove any stackguard hook entries from the settings tree.
 * Empty groups (no remaining handlers) are pruned. Returns the new settings
 * and a count of removed handlers.
 */
export function removeStackguardHook(input: ClaudeSettings): {
  settings: ClaudeSettings
  removed: number
} {
  const settings: ClaudeSettings = JSON.parse(JSON.stringify(input))
  let removed = 0

  if (!settings.hooks?.UserPromptSubmit) {
    return { settings, removed: 0 }
  }

  const newGroups: HookGroup[] = []
  for (const group of settings.hooks.UserPromptSubmit) {
    if (!group.hooks) {
      newGroups.push(group)
      continue
    }
    const filtered = group.hooks.filter((h) => {
      const isStackguard = h.type === 'command' && h.command?.includes(STACKGUARD_MARKER)
      if (isStackguard) removed++
      return !isStackguard
    })
    if (filtered.length > 0) {
      newGroups.push({ ...group, hooks: filtered })
    }
  }

  if (newGroups.length === 0) {
    delete settings.hooks.UserPromptSubmit
    if (Object.keys(settings.hooks).length === 0) {
      delete settings.hooks
    }
  } else {
    settings.hooks.UserPromptSubmit = newGroups
  }

  return { settings, removed }
}

export async function installHookCommand(opts: InstallHookOptions): Promise<void> {
  const file = settingsPath(opts)
  const scope = opts.global ? 'user-global' : 'project-local'

  let existing: ClaudeSettings
  try {
    existing = await readSettings(file)
  } catch (err) {
    console.error(chalk.red(`✗ stackguard install-hook: failed to read ${file}`))
    console.error((err as Error).message)
    process.exit(1)
  }

  if (opts.uninstall) {
    const { settings, removed } = removeStackguardHook(existing)
    if (removed === 0) {
      console.log(chalk.gray(`ℹ  No stackguard hook found in ${file}`))
      process.exit(0)
    }
    await writeSettings(file, settings)
    console.log(chalk.green(`✓ Removed ${removed} stackguard hook entry from ${file}`))
    process.exit(0)
  }

  const { settings, alreadyInstalled } = addStackguardHook(existing)
  if (alreadyInstalled) {
    console.log(chalk.gray(`ℹ  stackguard hook already installed in ${file}`))
    process.exit(0)
  }

  await writeSettings(file, settings)
  console.log(chalk.green(`✓ Installed stackguard hook (${scope})`))
  console.log(`  Settings file: ${file}`)
  console.log('')
  console.log('Claude Code will now run stackguard before submitting any prompt.')
  if (opts.global) {
    console.log('This applies to ALL projects on this machine. Projects without a')
    console.log('stackguard.json will pass through silently.')
  } else {
    console.log('This applies only to projects under this directory. Commit')
    console.log('.claude/settings.json so the rest of your team gets the same behavior.')
  }
  console.log('')
  console.log(`To remove: stackguard install-hook --uninstall${opts.global ? ' --global' : ''}`)
}
