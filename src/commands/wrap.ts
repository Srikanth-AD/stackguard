import os from 'node:os'
import { spawn } from 'node:child_process'
import chalk from 'chalk'
import { loadConfig } from '../lib/config.js'
import { loadPolicy } from '../lib/policyLoader.js'
import { checkPrompt } from '../lib/checker.js'
import { renderCheckResult, showPolicyPaged } from '../lib/renderer.js'
import { logEntry } from '../lib/logger.js'
import type { Config, AuditEntry, CheckResult, PolicyDocument } from '../types.js'

interface WrapOptions {
  policy?: string
  mode?: string
}

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

export async function wrapCommand(
  rawArgs: string[],
  options: WrapOptions
): Promise<void> {
  if (rawArgs.length === 0) {
    console.error(
      chalk.red('✗ stackguard wrap: no command specified after --')
    )
    process.exit(1)
  }

  const command = rawArgs[0]
  const args = rawArgs.slice(1)

  // Identify prompt
  let promptIdx = findPromptArgIndex(args)
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
    console.error(
      chalk.yellow(
        '⚠  stackguard: could not identify prompt argument, skipping check'
      )
    )
    execChild(command, args)
    return
  }

  let config = await loadConfig()
  if (!config && !options.policy) {
    console.error(chalk.red('✗ stackguard: no stackguard.json found'))
    console.error(
      "Run 'stackguard init' to set up policy checking for this project,"
    )
    console.error(
      'or pass --policy <path> to check against a policy file directly.'
    )
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
        await writeAudit(
          currentPrompt,
          result,
          overrideReason ? 'overridden' : 'passed',
          config,
          { overrideReason }
        )
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
