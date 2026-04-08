import os from 'node:os'
import { checkPrompt } from '../lib/checker.js'
import { loadConfig } from '../lib/config.js'
import { logEntry } from '../lib/logger.js'
import { loadPolicy } from '../lib/policyLoader.js'
import type { AuditEntry, CheckResult, Config, Violation } from '../types.js'

/**
 * Claude Code UserPromptSubmit hook contract:
 * - stdin is a JSON envelope with at least { prompt, cwd, session_id, ... }
 * - exit 0 = allow the prompt; stdout becomes additional context
 * - exit 2 = block the prompt; stderr is shown to the user as the reason
 * - any other exit code is treated as a hook failure and the prompt proceeds
 *
 * stackguard's "revise" flow does NOT apply in hook mode — Claude Code does
 * not allow hooks to rewrite the prompt. The user revises in the Claude Code
 * UI after seeing the block reason.
 *
 * Reference: https://code.claude.com/docs/en/hooks.md
 */

export interface HookPayload {
  prompt?: string
  cwd?: string
  session_id?: string
  hook_event_name?: string
  transcript_path?: string
  permission_mode?: string
}

/**
 * Read everything from stdin as a single string.
 */
async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf-8')
    process.stdin.on('data', (chunk) => {
      data += chunk
    })
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', () => resolve(''))
  })
}

/**
 * Parse the raw stdin payload Claude Code sends to a UserPromptSubmit hook.
 * Returns null when the input is malformed, missing the prompt field, or the
 * prompt is empty/whitespace-only — the hook should pass through silently in
 * all of those cases. Pure (no I/O) so it's unit-testable.
 */
export function parseHookPayload(raw: string): HookPayload | null {
  if (!raw?.trim()) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }

  const payload = parsed as HookPayload
  if (typeof payload.prompt !== 'string' || !payload.prompt.trim()) {
    return null
  }

  return payload
}

/**
 * Format violations into a single human-readable string suitable for stderr
 * (which Claude Code surfaces to the user when we exit 2).
 */
export function formatBlockMessage(result: CheckResult): string {
  const lines: string[] = []
  lines.push('✗ stackguard: prompt blocked by engineering policy')
  lines.push('')
  for (const v of result.violations) {
    lines.push(`• "${v.quote}"`)
    lines.push(`  Rule:  ${v.rule}`)
    lines.push(`  Why:   ${v.explanation}`)
    lines.push(`  Level: ${v.confidence.toUpperCase()} confidence`)
    lines.push('')
  }
  if (result.suggestedRevision) {
    lines.push('Suggested revision:')
    lines.push(`  ${result.suggestedRevision}`)
    lines.push('')
  }
  lines.push(
    'Edit your prompt and submit again, or run `stackguard policy show` to read the full policy.'
  )
  return lines.join('\n')
}

/**
 * Format low-confidence violations into a soft additionalContext message
 * (printed to stdout when we exit 0). Claude sees this as a system reminder.
 */
export function formatLowConfidenceContext(violations: Violation[]): string {
  const lines: string[] = []
  lines.push('[stackguard] Possible policy concern (low confidence — not blocking):')
  for (const v of violations) {
    lines.push(`- "${v.quote}" may conflict with "${v.rule}"`)
  }
  return lines.join('\n')
}

async function writeAudit(
  prompt: string,
  result: CheckResult,
  action: AuditEntry['action'],
  config: Config
): Promise<void> {
  const entry: AuditEntry = {
    timestamp: new Date().toISOString(),
    prompt,
    violations: result.violations,
    action,
    user: os.userInfo().username,
    cwd: process.cwd(),
  }
  await logEntry(entry, config.logPath || '~/.stackguard/audit.jsonl')
}

/**
 * Pure-ish hook entry point. Reads stdin (as JSON envelope), runs the check,
 * and exits with the right code per the Claude Code hook contract.
 *
 * Failure modes are intentionally permissive: malformed payload, missing
 * config, missing API key, or any internal error → exit 0 (allow). The hook
 * MUST NOT block the user because of its own bugs.
 */
export async function hookCommand(): Promise<void> {
  const raw = await readStdin()
  const payload = parseHookPayload(raw)
  if (!payload) {
    // Malformed payload, missing prompt, or empty prompt — pass through.
    process.exit(0)
  }
  // parseHookPayload guarantees prompt is a non-empty string.
  const prompt = payload.prompt!

  // Claude Code spawns hooks from its own cwd, but the project's
  // stackguard.json lives at the cwd Claude Code reports in the payload.
  // Switch to that directory so walk-up config discovery finds the right file.
  if (payload.cwd) {
    try {
      process.chdir(payload.cwd)
    } catch {
      // chdir failed — fall back to whatever cwd Claude Code spawned us in.
    }
  }

  let config: Config | null
  try {
    config = await loadConfig()
  } catch {
    process.exit(0)
  }
  if (!config) {
    // No stackguard.json in this project — pass through silently. The hook
    // is installed globally; not every project uses stackguard.
    process.exit(0)
  }

  // ignorePatterns
  if (config.ignorePatterns) {
    for (const pattern of config.ignorePatterns) {
      try {
        if (new RegExp(pattern, 'i').test(prompt)) {
          process.exit(0)
        }
      } catch {
        // ignore bad regex
      }
    }
  }

  let result: CheckResult
  try {
    const policy = await loadPolicy(config.policySource, config)
    const apiKey = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY || ''
    const model = config.model || 'claude-haiku-4-5-20251001'
    result = await checkPrompt(prompt, policy, apiKey, model)
  } catch {
    // Policy load failed or API errored — pass through.
    process.exit(0)
  }

  if (result.passed && !result.lowConfidenceOnly) {
    if (config.logOverrides) {
      await writeAudit(prompt, result, 'passed', config)
    }
    process.exit(0)
  }

  if (result.lowConfidenceOnly) {
    // Soft warning — surface as additionalContext but allow the prompt.
    if (config.logOverrides) {
      await writeAudit(prompt, result, 'passed', config)
    }
    console.log(formatLowConfidenceContext(result.violations))
    process.exit(0)
  }

  // Real violation. Block in block mode; otherwise pass with a context note.
  if (config.mode === 'block') {
    if (config.logOverrides) {
      await writeAudit(prompt, result, 'blocked', config)
    }
    console.error(formatBlockMessage(result))
    process.exit(2)
  }

  // warn mode (the default): can't show an interactive menu inside a hook,
  // so the best we can do is inject the violation as a system reminder and
  // let the prompt through. The audit log records the bypass.
  if (config.logOverrides) {
    await writeAudit(prompt, result, 'passed', config)
  }
  console.log(formatBlockMessage(result))
  process.exit(0)
}
