import { Command } from 'commander';
import chalk from 'chalk';
import { registerAuthCommands } from './commands/auth.js';
import { registerCustomerCommands } from './commands/customers.js';
import { registerJobCommands } from './commands/jobs.js';
import { registerEstimateCommands } from './commands/estimates.js';
import { registerTechnicianCommands } from './commands/technicians.js';
import { registerEquipmentCommands } from './commands/equipment.js';
import { registerInvoiceCommands } from './commands/invoices.js';
import { registerReportCommands } from './commands/reports.js';
import { registerInteractiveCommands } from './commands/interactive.js';
import { registerSyncCommands } from './commands/sync.js';

export function createProgram() {
  const program = new Command();

  program
    .name('sfcli')
    .description('Service Fusion CLI — manage customers, jobs, and more')
    .version('1.0.0')
    .option('--profile <name>', 'credential profile to use', 'default')
    .option('--output <format>', 'output format: table|json|csv|quiet', 'table')
    .option('--no-color', 'disable colored output')
    .option('--verbose', 'show debug info including API calls')
    .option('--dry-run', 'show what would be done without executing');

  // When --no-color is passed, disable chalk
  program.hook('preAction', (thisCommand) => {
    const opts = thisCommand.optsWithGlobals();
    if (opts.color === false) {
      chalk.level = 0;
    }
  });

  registerAuthCommands(program);
  registerCustomerCommands(program);
  registerJobCommands(program);
  registerEstimateCommands(program);
  registerTechnicianCommands(program);
  registerEquipmentCommands(program);
  registerInvoiceCommands(program);
  registerReportCommands(program);
  registerInteractiveCommands(program);
  registerSyncCommands(program);

  return program;
}
