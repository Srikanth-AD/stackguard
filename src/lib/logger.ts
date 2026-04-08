import fs from 'node:fs/promises'
import path from 'node:path'
import type { AuditEntry } from '../types.js'
import { expandHome } from './config.js'

export async function logEntry(entry: AuditEntry, logPath: string): Promise<void> {
  try {
    const expanded = expandHome(logPath)
    await fs.mkdir(path.dirname(expanded), { recursive: true })
    await fs.appendFile(expanded, `${JSON.stringify(entry)}\n`, 'utf-8')
  } catch {
    // Logging must never block the user
  }
}

export async function readEntries(
  logPath: string,
  filters?: { days?: number; user?: string }
): Promise<AuditEntry[]> {
  const expanded = expandHome(logPath)
  let raw: string
  try {
    raw = await fs.readFile(expanded, 'utf-8')
  } catch {
    return []
  }

  const lines = raw.split('\n').filter((l) => l.trim().length > 0)
  const entries: AuditEntry[] = []
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line))
    } catch {
      // skip malformed
    }
  }

  let filtered = entries
  if (filters?.days !== undefined) {
    const cutoff = Date.now() - filters.days * 86_400_000
    filtered = filtered.filter((e) => {
      const t = Date.parse(e.timestamp)
      return !Number.isNaN(t) && t >= cutoff
    })
  }
  if (filters?.user) {
    filtered = filtered.filter((e) => e.user === filters.user)
  }
  return filtered
}
