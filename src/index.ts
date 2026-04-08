import { Command } from 'commander'
import { initCommand } from './commands/init.js'
import { checkCommand } from './commands/check.js'
import { wrapCommand } from './commands/wrap.js'
import { auditCommand } from './commands/audit.js'
import { policyCommand } from './commands/policy.js'

const program = new Command()

program
  .name('stackguard')
  .description('Pre-prompt policy enforcement for AI coding assistants')
  .version('0.1.0')
  .option('--policy <path>', 'path to policy file (overrides config)')
  .option('--mode <mode>', 'warn or block (overrides config)')

program
  .command('init')
  .description('Set up stackguard.json in the current directory')
  .action(async () => {
    try {
      await initCommand()
    } catch (err) {
      console.error((err as Error).message)
      process.exit(1)
    }
  })

program
  .command('check <prompt>')
  .description('Check a prompt against the policy')
  .option('--policy <path>', 'override policySource from config')
  .option('--mode <mode>', 'override mode from config')
  .option('--json', 'output JSON result, no interactive UI')
  .option('--show-hash', 'print policy hash and exit')
  .action(async (prompt: string, opts: any) => {
    try {
      const merged = { ...program.opts(), ...opts }
      await checkCommand(prompt, merged)
    } catch (err) {
      console.error((err as Error).message)
      process.exit(1)
    }
  })

program
  .command('wrap')
  .description('Wrap an AI assistant command with stackguard checking')
  .option('--policy <path>', 'override policySource from config')
  .option('--mode <mode>', 'override mode from config')
  .allowUnknownOption(true)
  .helpOption(false)
  .action(async (opts: any, cmd: any) => {
    try {
      // Everything after `--` is in cmd.args
      const args: string[] = cmd.args || []
      const merged = { ...program.opts(), ...opts }
      await wrapCommand(args, merged)
    } catch (err) {
      console.error((err as Error).message)
      process.exit(1)
    }
  })

program
  .command('audit')
  .description('Show the override audit log')
  .option('--days <n>', 'only show entries within the last N days')
  .option('--user <name>', 'filter by user')
  .option('--json', 'output as JSON')
  .action(async (opts: any) => {
    try {
      await auditCommand(opts)
    } catch (err) {
      console.error((err as Error).message)
      process.exit(1)
    }
  })

program
  .command('policy <subcommand>')
  .description('Inspect the active policy (show | hash | source)')
  .action(async (subcommand: string) => {
    try {
      const merged = { ...program.opts() }
      await policyCommand(subcommand, merged)
    } catch (err) {
      console.error((err as Error).message)
      process.exit(1)
    }
  })

program.parseAsync(process.argv).catch((err) => {
  console.error(err)
  process.exit(1)
})
