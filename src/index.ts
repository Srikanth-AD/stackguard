import { Command } from 'commander'
import { auditCommand } from './commands/audit.js'
import { checkCommand } from './commands/check.js'
import { hookCommand } from './commands/hook.js'
import { initCommand } from './commands/init.js'
import { installHookCommand } from './commands/installHook.js'
import { policyCommand } from './commands/policy.js'
import { wrapEntrypoint } from './commands/wrap.js'

// Special-case `wrap` BEFORE commander parses anything. Commander's option
// parser doesn't play nicely with pass-through arguments to a wrapped CLI —
// unknown options like `--claude` get eaten and end up in the wrong place.
// Wrap parses its own argv tail; everything else goes through commander.
if (process.argv[2] === 'wrap') {
  wrapEntrypoint(process.argv.slice(3)).catch((err) => {
    console.error((err as Error).message ?? err)
    process.exit(1)
  })
} else {
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

  // Note: 'wrap' is intentionally NOT registered with commander. It's
  // intercepted at the top of this file because commander's option parser
  // mangles pass-through arguments. We register a stub command here only
  // so it shows up in `--help`.
  program
    .command('wrap')
    .description('Wrap an AI assistant command (use: stackguard wrap -- <cmd> [args...])')
    .allowUnknownOption(true)
    .helpOption(false)
    .action(() => {
      // Unreachable — handled at top of file.
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

  program
    .command('hook')
    .description('Run as a Claude Code UserPromptSubmit hook (reads JSON from stdin)')
    .action(async () => {
      try {
        await hookCommand()
      } catch (err) {
        // Hook must never block the user because of its own bugs.
        console.error((err as Error).message)
        process.exit(0)
      }
    })

  program
    .command('install-hook')
    .description('Install stackguard as a Claude Code UserPromptSubmit hook')
    .option('--global', 'install to ~/.claude/settings.json (default: project-local)')
    .option('--uninstall', 'remove the stackguard hook instead of installing it')
    .action(async (opts: any) => {
      try {
        await installHookCommand(opts)
      } catch (err) {
        console.error((err as Error).message)
        process.exit(1)
      }
    })

  program.parseAsync(process.argv).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
