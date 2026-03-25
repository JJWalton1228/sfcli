import { createInterface } from 'readline';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'fs';
import chalk from 'chalk';
import { createProgram } from '../index.js';
import { getActiveProfileName } from '../config/index.js';

const HISTORY_FILE = join(homedir(), '.sfcli', 'history');
const MAX_HISTORY = 500;

export function registerInteractiveCommands(program) {
  program
    .command('interactive')
    .alias('shell')
    .description('Launch interactive REPL mode')
    .action(async () => {
      const globalOpts = program.opts();
      const profileName = getActiveProfileName(globalOpts.profile);
      await startRepl(profileName, globalOpts);
    });
}

async function startRepl(profileName, globalOpts) {
  console.log(chalk.bold('\n  Service Fusion CLI — Interactive Mode'));
  console.log(chalk.dim(`  Profile: ${profileName}`));
  console.log(chalk.dim('  Type a command, "help" for reference, or "exit" to quit.\n'));

  // Load history
  const history = loadHistory();

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan(`[${profileName}] sfcli> `),
    history,
    historySize: MAX_HISTORY,
    completer: completer,
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    if (input === 'exit' || input === 'quit' || input === '.exit') {
      console.log(chalk.dim('Goodbye.'));
      rl.close();
      return;
    }

    if (input === 'help') {
      printReplHelp();
      rl.prompt();
      return;
    }

    // Save to history file
    saveHistoryLine(input);

    // Parse and execute the command
    try {
      // Build argv as if it were called from the CLI
      const argv = parseInput(input);
      // Carry over global options from the parent session
      const fullArgv = ['node', 'sfcli'];
      if (globalOpts.profile !== 'default') fullArgv.push('--profile', globalOpts.profile);
      if (globalOpts.output !== 'table') fullArgv.push('--output', globalOpts.output);
      if (globalOpts.verbose) fullArgv.push('--verbose');
      if (globalOpts.color === false) fullArgv.push('--no-color');
      if (globalOpts.dryRun) fullArgv.push('--dry-run');
      fullArgv.push(...argv);

      const replProgram = createProgram();
      replProgram.exitOverride(); // Prevent process.exit
      replProgram.configureOutput({
        writeErr: (str) => {
          // Suppress commander error output for unknown commands
          if (!str.includes("error: unknown command")) {
            process.stderr.write(str);
          }
        },
      });

      await replProgram.parseAsync(fullArgv);
    } catch (err) {
      // Commander throws on unknown commands and --help
      if (err.code === 'commander.unknownCommand') {
        console.error(chalk.red(`Unknown command: ${input}. Type "help" for available commands.`));
      } else if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version') {
        // Help/version was displayed, that's fine
      } else if (err.message) {
        console.error(chalk.red(err.message));
      }
    }

    console.log(); // blank line between commands
    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

/**
 * Parse a REPL input line into argv tokens, respecting quotes.
 */
function parseInput(input) {
  const tokens = [];
  let current = '';
  let inQuote = null;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
    } else if (ch === ' ') {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

const COMMANDS = [
  'auth', 'auth login', 'auth logout', 'auth whoami', 'auth profiles', 'auth add-profile', 'auth switch',
  'customers', 'customers list', 'customers get', 'customers search', 'customers create', 'customers update',
  'jobs', 'jobs list', 'jobs get', 'jobs today', 'jobs this-week', 'jobs create', 'jobs update', 'jobs status', 'jobs dispatch', 'jobs assign',
  'estimates', 'estimates list', 'estimates get', 'estimates search', 'estimates create',
  'techs', 'techs list', 'techs get',
  'equipment', 'equipment list', 'equipment get', 'equipment search',
  'invoices', 'invoices list', 'invoices get',
  'report', 'report jobs-summary', 'report revenue', 'report revenue-by-customer',
  'report tech-performance', 'report customer-aging', 'report customer-activity',
  'help', 'exit',
];

function completer(line) {
  const hits = COMMANDS.filter((c) => c.startsWith(line));
  return [hits.length ? hits : COMMANDS, line];
}

function loadHistory() {
  try {
    if (existsSync(HISTORY_FILE)) {
      return readFileSync(HISTORY_FILE, 'utf8').split('\n').filter(Boolean).slice(-MAX_HISTORY);
    }
  } catch {}
  return [];
}

function saveHistoryLine(line) {
  try {
    const dir = join(homedir(), '.sfcli');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(HISTORY_FILE, line + '\n');
  } catch {}
}

function printReplHelp() {
  console.log(`
${chalk.bold('Available commands:')}

  ${chalk.cyan('customers')} list | get <id> | search <q> | create | update <id>
  ${chalk.cyan('jobs')}      list | get <id> | today | this-week | create | update <id> | status <id> <s> | dispatch <id> | assign <id>
  ${chalk.cyan('estimates')} list | get <id> | search <q> | create
  ${chalk.cyan('techs')}     list | get <id>
  ${chalk.cyan('equipment')} list | get <id> | search <q>
  ${chalk.cyan('invoices')}  list | get <id>
  ${chalk.cyan('report')}    jobs-summary | revenue | revenue-by-customer | tech-performance | customer-aging | customer-activity
  ${chalk.cyan('auth')}      login | logout | whoami | profiles | add-profile <name> | switch <name>

  ${chalk.dim('Add --help to any command for options. Use Tab for completion.')}
  ${chalk.dim('Type "exit" to quit.')}
`);
}
