import { spawn } from 'node:child_process'
import readline from 'node:readline'
import chalk from 'chalk'
import type { CheckResult, Violation } from '../types.js'

const MAX_WIDTH = 72
const REVISION_INNER = 58

/**
 * Trim a string to at most `n` characters, appending an ellipsis (…) if it
 * had to be cut. Strings already short enough are returned unchanged. The
 * returned string is always at most `n` characters long.
 */
export function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return `${s.slice(0, n - 1)}…`
}

/**
 * Greedy word-wrap. Splits on any whitespace, then packs words into lines
 * up to `width` characters. Words longer than `width` are placed on their
 * own line (we never break inside a word).
 */
export function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0)
  const lines: string[] = []
  let current = ''
  for (const w of words) {
    if (!current) {
      current = w
      continue
    }
    if (current.length + 1 + w.length <= width) {
      current += ` ${w}`
    } else {
      lines.push(current)
      current = w
    }
  }
  if (current) lines.push(current)
  return lines
}

/**
 * Build the lines of a single violation block (without colors). Pure —
 * exported for testing. The interactive renderer wraps these in chalk and
 * sends them to stdout.
 */
export function formatViolationLines(v: Violation, index: number, total: number): string[] {
  const lines: string[] = []
  if (total > 1) {
    lines.push(`(${index + 1}/${total})`)
  }
  lines.push(`"${truncate(v.quote, MAX_WIDTH - 2)}"`)
  lines.push(`Rule:   ${truncate(v.rule, MAX_WIDTH - 8)}`)
  lines.push(`Why:    ${truncate(v.explanation, MAX_WIDTH - 8)}`)
  lines.push(`Level:  ${v.confidence.toUpperCase()} confidence`)
  return lines
}

/**
 * Build the lines of the suggested-revision box. Pure — exported for
 * testing. The interactive renderer prints these in green.
 */
export function formatRevisionBox(revision: string): string[] {
  const lines = wrap(revision, REVISION_INNER)
  const top = `┌${'─'.repeat(REVISION_INNER + 2)}┐`
  const bot = `└${'─'.repeat(REVISION_INNER + 2)}┘`
  const out: string[] = ['Suggested revision:', top]
  for (const ln of lines) {
    const padded = ln.padEnd(REVISION_INNER, ' ')
    out.push(`│ ${padded} │`)
  }
  out.push(bot)
  return out
}

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

function printViolation(v: Violation, index: number, total: number): void {
  const lines = formatViolationLines(v, index, total)
  if (total > 1) {
    console.log(chalk.bold(lines.shift()!))
  }
  // First remaining line is the quote — color it red.
  console.log(chalk.red(lines.shift()!))
  for (const ln of lines) {
    console.log(ln)
  }
  console.log('')
}

function printRevisionBox(revision: string): void {
  const lines = formatRevisionBox(revision)
  console.log(chalk.green(lines.shift()!))
  for (const ln of lines) {
    console.log(ln)
  }
  console.log('')
}

export async function renderCheckResult(
  result: CheckResult,
  _prompt: string,
  mode: 'warn' | 'block',
  onProceed: (reason?: string) => void | Promise<void>,
  onRevise: (revisedPrompt: string) => void | Promise<void>,
  onShowPolicy: () => void | Promise<void>,
  onCancel: () => void | Promise<void>
): Promise<void> {
  // CASE 1: passed
  if (result.passed && !result.lowConfidenceOnly) {
    console.log(chalk.green('✓ stackguard: ok'))
    await onProceed()
    return
  }

  // CASE 2: low-confidence only
  if (result.lowConfidenceOnly) {
    console.log(chalk.gray('ℹ  stackguard: possible conflict (low confidence — passing through)'))
    for (const v of result.violations) {
      const line = `"${v.quote}" may conflict with "${v.rule}"`
      console.log(chalk.gray(truncate(line, MAX_WIDTH)))
    }
    await onProceed()
    return
  }

  // CASE 3 / 4: violations
  console.log(chalk.yellow('⚠  stackguard: guideline conflict detected'))
  console.log('─'.repeat(MAX_WIDTH))
  console.log('')

  result.violations.forEach((v, i) => {
    printViolation(v, i, result.violations.length)
  })

  if (result.suggestedRevision) {
    printRevisionBox(result.suggestedRevision)
  }

  await showMenu(result, mode, onProceed, onRevise, onShowPolicy, onCancel)
}

async function showMenu(
  result: CheckResult,
  mode: 'warn' | 'block',
  onProceed: (reason?: string) => void | Promise<void>,
  onRevise: (revisedPrompt: string) => void | Promise<void>,
  onShowPolicy: () => void | Promise<void>,
  onCancel: () => void | Promise<void>
): Promise<void> {
  const menu =
    mode === 'block'
      ? '[R]evise  [O]verride with reason  [S]how policy  [C]ancel'
      : '[P]roceed anyway  [R]evise  [S]how policy  [C]ancel'

  while (true) {
    console.log(chalk.bold(menu))
    const answer = (await ask('> ')).trim().toLowerCase()
    const key = answer.charAt(0)

    if ((mode === 'warn' && key === 'p') || (mode === 'block' && key === 'o')) {
      // Override / Proceed with reason
      let reason = ''
      while (!reason) {
        reason = (await ask('Override reason (required): ')).trim()
        if (!reason) console.log('Reason required.')
      }
      await onProceed(reason)
      return
    }

    if (key === 'r') {
      if (result.suggestedRevision) {
        const yn = (await ask('Use suggested revision? [Y]es / [N]o, type my own: '))
          .trim()
          .toLowerCase()
        if (yn === '' || yn.startsWith('y')) {
          await onRevise(result.suggestedRevision)
          return
        }
        const own = (await ask('Your revision: ')).trim()
        if (own) {
          await onRevise(own)
          return
        }
        // empty → re-show menu
        continue
      } else {
        const own = (await ask('Your revised prompt: ')).trim()
        if (own) {
          await onRevise(own)
          return
        }
        continue
      }
    }

    if (key === 's') {
      await onShowPolicy()
      continue
    }

    if (key === 'c') {
      await onCancel()
      return
    }

    // unknown → re-show
  }
}

export function showPolicyPaged(content: string): Promise<void> {
  return new Promise((resolve) => {
    if (!process.stdout.isTTY) {
      console.log(content)
      resolve()
      return
    }
    try {
      const child = spawn('less', ['-R'], { stdio: ['pipe', 'inherit', 'inherit'] })
      child.on('error', () => {
        console.log(content)
        resolve()
      })
      child.on('exit', () => resolve())
      child.stdin.write(content)
      child.stdin.end()
    } catch {
      console.log(content)
      resolve()
    }
  })
}
