import { spawn } from 'node:child_process'
import os from 'node:os'
import chalk from 'chalk'
import { checkPrompt } from '../lib/checker.js'
import { loadConfig } from '../lib/config.js'
import { logEntry } from '../lib/logger.js'
import { loadPolicy } from '../lib/policyLoader.js'
import { renderCheckResult, showPolicyPaged } from '../lib/renderer.js'
import type { AuditEntry, CheckResult, Config } from '../types.js'

interface WrapOptions {
  policy?: string
  mode?: string
}

export interface ParsedWrapInvocation {
  policy?: string
  mode?: 'warn' | 'block'
  help: boolean
  args: string[]
  error?: string
}

/**
 * Parse the argv tail that follows `stackguard wrap`. We do this ourselves
 * instead of letting commander handle it because commander's option parser
 * fights with pass-through arguments — `--claude` would be eaten as an
 * unknown option even with allowUnknownOption(true), and post-`--` args
 * land in inconsistent places across commander versions.
 *
 * Accepted shapes:
 *   stackguard wrap claude "prompt"
 *   stackguard wrap -- claude "prompt"
 *   stackguard wrap --policy ./p.md -- claude "prompt"
 *   stackguard wrap --mode block -- claude --some-flag "prompt"
 *
 * Returns an `error` string when the input is unusable.
 */
export function parseWrapArgs(argv: string[]): ParsedWrapInvocation {
  const result: ParsedWrapInvocation = { help: false, args: [] }
  let i = 0
  let sawSeparator = false

  while (i < argv.length) {
    const a = argv[i]

    if (sawSeparator) {
      result.args.push(a)
      i++
      continue
    }

    if (a === '--') {
      sawSeparator = true
      i++
      continue
    }

    if (a === '--help' || a === '-h') {
      result.help = true
      i++
      continue
    }

    if (a === '--policy') {
      const next = argv[i + 1]
      if (!next || next.startsWith('-')) {
        result.error = '--policy requires a path argument'
        return result
      }
      result.policy = next
      i += 2
      continue
    }

    if (a === '--mode') {
      const next = argv[i + 1]
      if (next !== 'warn' && next !== 'block') {
        result.error = "--mode must be 'warn' or 'block'"
        return result
      }
      result.mode = next
      i += 2
      continue
    }

    // First non-option token is the start of the wrapped command. Everything
    // from here on is pass-through, even option-looking tokens.
    sawSeparator = true
    result.args.push(a)
    i++
  }

  if (result.help) return result

  if (result.args.length === 0) {
    result.error = 'no command specified — usage: stackguard wrap -- <command> [args...]'
    return result
  }

  if (result.args[0].startsWith('-')) {
    result.error = `command must not start with '-' (got '${result.args[0]}'). Did you forget the '--' separator? Try: stackguard wrap -- ${result.args[0].replace(/^-+/, '')} ...`
    return result
  }

  return result
}

const WRAP_HELP = `Usage: stackguard wrap [--policy <path>] [--mode warn|block] -- <command> [args...]

Wrap an AI assistant CLI with stackguard checking. Everything after
the '--' separator is forwarded to the wrapped command. The last
non-flag argument is treated as the prompt to check.

Examples:
  stackguard wrap -- claude "add a database connection"
  stackguard wrap -- cursor agent "refactor this file"
  stackguard wrap --mode block -- claude "implement token signing"
`

function findPromptArgIndex(args: string[]): number {
  for (let i = args.length - 1; i >= 0; i--) {
    const a = args[i]
    if (!a.startsWith('-')) return i
  }
  return -1
}

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf-8')
    process.stdin.on('data', (chunk) => (data += chunk))
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', () => resolve(''))
  })
}

function execChild(command: string, args: string[]): void {
  const child = spawn(command, args, { stdio: 'inherit' })

  const forward = (sig: NodeJS.Signals) => {
    try {
      child.kill(sig)
    } catch {
      // ignore
    }
  }
  process.on('SIGINT', () => forward('SIGINT'))
  process.on('SIGTERM', () => forward('SIGTERM'))

  child.on('exit', (code, signal) => {
    if (signal) {
      process.exit(1)
    }
    process.exit(code ?? 0)
  })
  child.on('error', (err) => {
    console.error(chalk.red(`stackguard wrap: failed to spawn ${command}: ${err.message}`))
    process.exit(127)
  })
}

/**
 * Top-level entry point used by index.ts. Parses argv directly, prints help
 * or errors as needed, and delegates to runWrap on success.
 */
export async function wrapEntrypoint(argv: string[]): Promise<void> {
  const parsed = parseWrapArgs(argv)

  if (parsed.help) {
    console.log(WRAP_HELP)
    process.exit(0)
  }

  if (parsed.error) {
    console.error(chalk.red(`✗ stackguard wrap: ${parsed.error}`))
    console.error('')
    console.error(WRAP_HELP)
    process.exit(1)
  }

  await wrapCommand(parsed.args, { policy: parsed.policy, mode: parsed.mode })
}

export async function wrapCommand(rawArgs: string[], options: WrapOptions): Promise<void> {
  if (rawArgs.length === 0) {
    console.error(chalk.red('✗ stackguard wrap: no command specified'))
    console.error('')
    console.error(WRAP_HELP)
    process.exit(1)
  }

  const command = rawArgs[0]
  const args = rawArgs.slice(1)

  if (command.startsWith('-')) {
    // Defense in depth — parseWrapArgs should have caught this already.
    console.error(
      chalk.red(`✗ stackguard wrap: command must not start with '-' (got '${command}')`)
    )
    console.error('')
    console.error(WRAP_HELP)
    process.exit(1)
  }

  // Identify prompt
  const promptIdx = findPromptArgIndex(args)
  let prompt: string | null = null
  if (promptIdx >= 0) {
    prompt = args[promptIdx]
  }

  if (prompt === null && !process.stdin.isTTY) {
    const piped = await readStdin()
    if (piped.trim()) {
      prompt = piped.trim()
    }
  }

  if (prompt === null) {
    console.error(chalk.yellow('⚠  stackguard: could not identify prompt argument, skipping check'))
    execChild(command, args)
    return
  }

  let config = await loadConfig()
  if (!config && !options.policy) {
    console.error(chalk.red('✗ stackguard: no stackguard.json found'))
    console.error("Run 'stackguard init' to set up policy checking for this project,")
    console.error('or pass --policy <path> to check against a policy file directly.')
    process.exit(1)
  }
  if (!config) {
    config = {
      policySource: options.policy!,
      model: 'claude-haiku-4-5-20251001',
      mode: 'warn',
      logOverrides: true,
      logPath: '~/.stackguard/audit.jsonl',
    } as Config
  }
  if (options.policy) config.policySource = options.policy
  if (options.mode === 'warn' || options.mode === 'block') {
    config.mode = options.mode
  }

  const policy = await loadPolicy(config.policySource, config)
  const apiKey = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY || ''
  const model = config.model || 'claude-haiku-4-5-20251001'

  // ignorePatterns
  if (config.ignorePatterns) {
    for (const pattern of config.ignorePatterns) {
      try {
        if (new RegExp(pattern, 'i').test(prompt)) {
          execChild(command, args)
          return
        }
      } catch {
        // ignore
      }
    }
  }

  let result = await checkPrompt(prompt, policy, apiKey, model)
  let currentPrompt = prompt

  // Non-TTY: just print + run if allowed
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    if (!result.passed) {
      console.error(JSON.stringify(result, null, 2))
      if (config.mode === 'block') {
        process.exit(1)
      }
    }
    execChild(command, args)
    return
  }

  while (true) {
    let resolved = false
    let action: 'proceed' | 'revise' | 'cancel' = 'proceed'
    let overrideReason: string | undefined
    let revisedPrompt: string | undefined

    await renderCheckResult(
      result,
      currentPrompt,
      (config.mode || 'warn') as 'warn' | 'block',
      (reason) => {
        action = 'proceed'
        overrideReason = reason
        resolved = true
      },
      (revised) => {
        action = 'revise'
        revisedPrompt = revised
        resolved = true
      },
      async () => {
        await showPolicyPaged(policy.content)
      },
      () => {
        action = 'cancel'
        resolved = true
      }
    )

    if (!resolved) return

    if (action === 'cancel') {
      if (config.logOverrides) {
        await writeAudit(currentPrompt, result, 'cancelled', config)
      }
      process.exit(0)
    }

    if (action === 'proceed') {
      if (config.logOverrides) {
        await writeAudit(currentPrompt, result, overrideReason ? 'overridden' : 'passed', config, {
          overrideReason,
        })
      }
      // Replace prompt arg in args if revised
      execChild(command, args)
      return
    }

    if (action === 'revise' && revisedPrompt) {
      if (config.logOverrides) {
        await writeAudit(currentPrompt, result, 'revised', config, {
          revisedPrompt,
        })
      }
      // Update args with revised prompt
      if (promptIdx >= 0) {
        args[promptIdx] = revisedPrompt
      }
      currentPrompt = revisedPrompt
      result = await checkPrompt(currentPrompt, policy, apiKey, model)
      // If now passes outright, just run
      if (result.passed && !result.lowConfidenceOnly) {
        console.log(chalk.green('✓ stackguard: ok'))
        execChild(command, args)
        return
      }
      continue
    }

    return
  }
}

async function writeAudit(
  prompt: string,
  result: CheckResult,
  action: AuditEntry['action'],
  config: Config,
  extras: { overrideReason?: string; revisedPrompt?: string } = {}
): Promise<void> {
  const entry: AuditEntry = {
    timestamp: new Date().toISOString(),
    prompt,
    violations: result.violations,
    action,
    overrideReason: extras.overrideReason,
    revisedPrompt: extras.revisedPrompt,
    user: os.userInfo().username,
    cwd: process.cwd(),
  }
  await logEntry(entry, config.logPath || '~/.stackguard/audit.jsonl')
}
