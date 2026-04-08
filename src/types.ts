export interface PolicyDocument {
  content: string
  hash: string // sha256 of raw content
  source: string // file path or HTTPS URL
  loadedAt: string // ISO timestamp
}

export interface Config {
  policySource: string
  policyHash?: string
  anthropicApiKey?: string
  model?: string // default: claude-haiku-4-5-20251001
  mode?: 'warn' | 'block' // default: warn
  logOverrides?: boolean // default: true
  logPath?: string // default: ~/.stackguard/audit.jsonl
  ignorePatterns?: string[]
}

export interface CheckResult {
  passed: boolean
  violations: Violation[]
  suggestedRevision: string | null
  confidence: 'high' | 'medium' | 'low'
  lowConfidenceOnly?: boolean
}

export interface Violation {
  quote: string // exact text from prompt that conflicts
  rule: string // relevant guideline, quoted from policy
  explanation: string // one sentence
  confidence: 'high' | 'medium' | 'low'
}

export interface AuditEntry {
  timestamp: string
  prompt: string
  violations: Violation[]
  action: 'passed' | 'overridden' | 'revised' | 'cancelled'
  overrideReason?: string
  revisedPrompt?: string
  user: string
  cwd: string
}
