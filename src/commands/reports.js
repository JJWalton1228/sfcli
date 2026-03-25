import chalk from 'chalk';
import { createClient } from '../api/client.js';
import { getActiveProfileName, getProfileConfig } from '../config/index.js';
import { outputReport } from '../reports/engine.js';
import { jobSummaryReport } from '../reports/templates/job-summary.js';
import { revenueReport, revenueByCustomerReport } from '../reports/templates/revenue.js';
import { techPerformanceReport } from '../reports/templates/technician-perf.js';
import { customerAgingReport, customerActivityReport } from '../reports/templates/customer-aging.js';

export function registerReportCommands(program) {
  const report = program.command('report').description('Generate reports');

  // --- jobs-summary ---
  report
    .command('jobs-summary')
    .description('Job summary by status with revenue')
    .option('--period <period>', 'Period: this-week|this-month|this-quarter|this-year|YYYY-QN|from..to')
    .option('--from <date>', 'Start date (YYYY-MM-DD)')
    .option('--to <date>', 'End date (YYYY-MM-DD)')
    .option('--format <fmt>', 'Output: table|json|csv', 'table')
    .option('--output <file>', 'Write to file')
    .action(async (options) => {
      try {
        const client = initClient(program);
        const content = await jobSummaryReport(client, options);
        outputReport(content, options);
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  // --- revenue ---
  report
    .command('revenue')
    .description('Monthly revenue breakdown')
    .option('--period <period>', 'Period')
    .option('--from <date>', 'Start date')
    .option('--to <date>', 'End date')
    .option('--format <fmt>', 'Output: table|json|csv', 'table')
    .option('--output <file>', 'Write to file')
    .action(async (options) => {
      try {
        const client = initClient(program);
        const content = await revenueReport(client, options);
        outputReport(content, options);
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  // --- revenue-by-customer ---
  report
    .command('revenue-by-customer')
    .description('Revenue ranked by customer')
    .option('--period <period>', 'Period')
    .option('--from <date>', 'Start date')
    .option('--to <date>', 'End date')
    .option('--top <n>', 'Top N customers', parseInt, 20)
    .option('--format <fmt>', 'Output: table|json|csv', 'table')
    .option('--output <file>', 'Write to file')
    .action(async (options) => {
      try {
        const client = initClient(program);
        const content = await revenueByCustomerReport(client, options);
        outputReport(content, options);
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  // --- tech-performance ---
  report
    .command('tech-performance')
    .description('Technician performance: jobs, revenue, avg time')
    .option('--period <period>', 'Period')
    .option('--from <date>', 'Start date')
    .option('--to <date>', 'End date')
    .option('--format <fmt>', 'Output: table|json|csv', 'table')
    .option('--output <file>', 'Write to file')
    .action(async (options) => {
      try {
        const client = initClient(program);
        const content = await techPerformanceReport(client, options);
        outputReport(content, options);
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  // --- customer-aging ---
  report
    .command('customer-aging')
    .description('Customer aging: days since last service')
    .option('--format <fmt>', 'Output: table|json|csv', 'table')
    .option('--output <file>', 'Write to file')
    .action(async (options) => {
      try {
        const client = initClient(program);
        const content = await customerAgingReport(client, options);
        outputReport(content, options);
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  // --- customer-activity ---
  report
    .command('customer-activity')
    .description('Inactive customers')
    .option('--inactive-days <n>', 'Days since last service', parseInt, 90)
    .option('--format <fmt>', 'Output: table|json|csv', 'table')
    .option('--output <file>', 'Write to file')
    .action(async (options) => {
      try {
        const client = initClient(program);
        const content = await customerActivityReport(client, {
          inactiveDays: options.inactiveDays,
          format: options.format,
        });
        outputReport(content, options);
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });
}

function initClient(program) {
  const globalOpts = program.opts();
  const profileName = getActiveProfileName(globalOpts.profile);
  const profileConfig = getProfileConfig(profileName);
  return createClient(profileName, { baseUrl: profileConfig.base_url, verbose: globalOpts.verbose });
}
