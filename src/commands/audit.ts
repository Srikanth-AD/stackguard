import chalk from 'chalk'
import { loadConfig } from '../lib/config.js'
import { readEntries } from '../lib/logger.js'

interface AuditOptions {
  days?: string
  user?: string
  json?: boolean
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n - 1) + '…'
}

export async function auditCommand(options: AuditOptions): Promise<void> {
  const config = await loadConfig()
  const logPath = config?.logPath || '~/.stackguard/audit.jsonl'

  const filters: { days?: number; user?: string } = {}
  if (options.days) {
    const n = parseInt(options.days, 10)
    if (!isNaN(n)) filters.days = n
  }
  if (options.user) filters.user = options.user

  const entries = await readEntries(logPath, filters)
  entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  if (options.json) {
    console.log(JSON.stringify(entries, null, 2))
    return
  }

  if (entries.length === 0) {
    console.log('No override entries found.')
    return
  }

  const parts: string[] = ['Override Log']
  if (filters.days !== undefined) parts.push(` — last ${filters.days} days`)
  if (filters.user) parts.push(` — ${filters.user}`)
  console.log(chalk.bold(parts.join('')))
  console.log(`${entries.length} entries`)
  console.log('')

  for (const e of entries) {
    const d = new Date(e.timestamp)
    const date = d.toISOString().slice(0, 10)
    const time = d.toISOString().slice(11, 19)
    console.log(
      `${date} ${time}  ${e.user}  [${e.action}]`
    )
    console.log(`Prompt:  "${truncate(e.prompt, 60)}"`)
    if (e.action === 'overridden' && e.overrideReason) {
      console.log(`Reason:  "${e.overrideReason}"`)
    }
    if (e.action === 'revised' && e.revisedPrompt) {
      console.log(`Revised: "${truncate(e.revisedPrompt, 60)}"`)
    }
    console.log('')
  }
}
