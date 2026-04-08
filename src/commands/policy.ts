import chalk from 'chalk'
import { loadConfig } from '../lib/config.js'
import { loadPolicy } from '../lib/policyLoader.js'
import type { Config } from '../types.js'

interface PolicyOptions {
  policy?: string
}

async function getPolicyConfig(options: PolicyOptions): Promise<Config> {
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
  return config
}

export async function policyCommand(subcommand: string, options: PolicyOptions): Promise<void> {
  const config = await getPolicyConfig(options)
  // Suppress hash tip during policy commands by passing config (it always passes)
  const policy = await loadPolicy(config.policySource, config)

  switch (subcommand) {
    case 'show':
      console.log(policy.content)
      break
    case 'hash':
      console.log(`sha256:${policy.hash}`)
      break
    case 'source':
      console.log(policy.source)
      break
    default:
      console.error(chalk.red(`✗ stackguard policy: unknown subcommand '${subcommand}'`))
      console.error('Available: show, hash, source')
      process.exit(1)
  }
}
