import readline from 'node:readline'
import path from 'node:path'
import chalk from 'chalk'
import { writeConfig } from '../lib/config.js'
import type { Config } from '../types.js'

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

export async function initCommand(): Promise<void> {
  const policySource = (
    await ask('Policy document source (file path or HTTPS URL): ')
  ).trim()

  let mode: 'warn' | 'block' = 'warn'
  const modeAnswer = (await ask('Mode — warn or block? [warn]: '))
    .trim()
    .toLowerCase()
  if (modeAnswer === 'block') mode = 'block'

  let logOverrides = true
  const logAnswer = (await ask('Log overrides? [yes]: ')).trim().toLowerCase()
  if (logAnswer === 'no' || logAnswer === 'n') logOverrides = false

  const config: Partial<Config> = {
    policySource,
    mode,
    model: 'claude-haiku-4-5-20251001',
    logOverrides,
    logPath: '~/.stackguard/audit.jsonl',
  }

  const target = path.join(process.cwd(), 'stackguard.json')
  await writeConfig(target, config)

  console.log(chalk.green('✓ Created stackguard.json'))
  console.log('')
  console.log('Next steps:')
  console.log('')
  console.log(
    '  • Commit stackguard.json to your repo (contains no secrets)'
  )
  console.log('  • Set ANTHROPIC_API_KEY in your shell environment')
  console.log('  • stackguard check "your prompt here"')
  console.log('  • stackguard wrap -- claude "your prompt"')
  console.log('')
  console.log('To lock the policy hash (recommended for teams):')
  console.log('  stackguard policy hash')
  console.log(
    '  Then add the output to stackguard.json as "policyHash"'
  )
}
