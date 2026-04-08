import os from 'node:os'
import chalk from 'chalk'
import { checkPrompt } from '../lib/checker.js'
import { loadConfig } from '../lib/config.js'
import { logEntry } from '../lib/logger.js'
import { loadPolicy } from '../lib/policyLoader.js'
import { renderCheckResult, showPolicyPaged } from '../lib/renderer.js'
import type { AuditEntry, CheckResult, Config, PolicyDocument } from '../types.js'

interface CheckOptions {
  policy?: string
  mode?: string
  json?: boolean
  showHash?: boolean
}

function noConfigError(): never {
  console.error(chalk.red('✗ stackguard: no stackguard.json found'))
  console.error("Run 'stackguard init' to set up policy checking for this project,")
  console.error('or pass --policy <path> to check against a policy file directly.')
  process.exit(1)
}

export async function checkCommand(prompt: string, options: CheckOptions): Promise<void> {
  let config = await loadConfig()
  if (!config && !options.policy) {
    noConfigError()
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

  if (options.showHash) {
    console.log(`sha256:${policy.hash}`)
    process.exit(0)
  }

  // ignorePatterns
  if (config.ignorePatterns && config.ignorePatterns.length > 0) {
    for (const pattern of config.ignorePatterns) {
      try {
        const re = new RegExp(pattern, 'i')
        if (re.test(prompt)) {
          console.log(chalk.green('✓ stackguard: skipped (informational prompt)'))
          process.exit(0)
        }
      } catch {
        // ignore bad regex
      }
    }
  }

  const apiKey = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY || ''
  const model = config.model || 'claude-haiku-4-5-20251001'

  const result = await checkPrompt(prompt, policy, apiKey, model)

  // --json mode
  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
    process.exit(result.passed ? 0 : 1)
  }

  // Non-TTY (CI/piped)
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    if (!result.passed) {
      console.error(JSON.stringify(result, null, 2))
      process.exit(config.mode === 'block' ? 1 : 0)
    }
    if (result.lowConfidenceOnly) {
      console.error(JSON.stringify(result, null, 2))
    }
    process.exit(0)
  }

  await runInteractive(result, prompt, policy, config, apiKey, model)
}

async function runInteractive(
  initialResult: CheckResult,
  initialPrompt: string,
  policy: PolicyDocument,
  config: Config,
  apiKey: string,
  model: string
): Promise<void> {
  let currentPrompt = initialPrompt
  let currentResult = initialResult

  while (true) {
    let resolved = false
    let action: 'proceed' | 'revise' | 'cancel' = 'proceed'
    let overrideReason: string | undefined
    let revisedPrompt: string | undefined

    await renderCheckResult(
      currentResult,
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
        await writeAudit(currentPrompt, currentResult, 'cancelled', config)
      }
      process.exit(0)
    }

    if (action === 'proceed') {
      if (config.logOverrides) {
        const auditAction = overrideReason ? 'overridden' : 'passed'
        await writeAudit(currentPrompt, currentResult, auditAction, config, { overrideReason })
      }
      process.exit(0)
    }

    if (action === 'revise' && revisedPrompt) {
      if (config.logOverrides) {
        await writeAudit(currentPrompt, currentResult, 'revised', config, {
          revisedPrompt,
        })
      }
      currentPrompt = revisedPrompt
      currentResult = await checkPrompt(currentPrompt, policy, apiKey, model)
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
