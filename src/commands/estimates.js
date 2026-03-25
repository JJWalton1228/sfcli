import chalk from 'chalk';
import inquirer from 'inquirer';
import { createClient } from '../api/client.js';
import { createEstimatesApi } from '../api/estimates.js';
import { getActiveProfileName, getProfileConfig } from '../config/index.js';
import { output, outputDetail } from '../utils/output.js';

const ESTIMATE_COLUMNS = ['id', 'customer_id', 'status', 'description', 'total'];
const ESTIMATE_HEADERS = {
  id: 'ID',
  customer_id: 'Customer',
  status: 'Status',
  description: 'Description',
  total: 'Total',
  created_at: 'Created',
};

export function registerEstimateCommands(program) {
  const estimates = program.command('estimates').description('Manage estimates');

  estimates
    .command('list')
    .description('List estimates')
    .option('--all', 'Fetch all pages')
    .option('--limit <n>', 'Limit results', parseInt)
    .option('--customer <id>', 'Filter by customer ID')
    .action(async (options) => {
      const globalOpts = program.opts();
      try {
        const { api } = initApi(globalOpts);
        const params = {};
        if (options.customer) params.customer_id = options.customer;
        const items = await api.list(params, { all: options.all, limit: options.limit });
        output(items, { format: globalOpts.output, columns: ESTIMATE_COLUMNS, headers: ESTIMATE_HEADERS });
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  estimates
    .command('get <id>')
    .description('Get an estimate by ID')
    .action(async (id) => {
      const globalOpts = program.opts();
      try {
        const { api } = initApi(globalOpts);
        const estimate = await api.get(id);
        outputDetail(estimate, { format: globalOpts.output, headers: ESTIMATE_HEADERS });
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  estimates
    .command('search <query>')
    .description('Search estimates')
    .action(async (query) => {
      const globalOpts = program.opts();
      try {
        const { api } = initApi(globalOpts);
        const items = await api.search({ q: query });
        output(items, { format: globalOpts.output, columns: ESTIMATE_COLUMNS, headers: ESTIMATE_HEADERS });
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  estimates
    .command('create')
    .description('Create an estimate')
    .option('--customer <id>', 'Customer ID')
    .option('--description <text>', 'Description')
    .option('--json <data>', 'JSON data string')
    .action(async (options) => {
      const globalOpts = program.opts();
      try {
        const { api } = initApi(globalOpts);
        let data;

        if (options.json) {
          data = JSON.parse(options.json);
        } else if (options.customer) {
          data = { customer_id: parseInt(options.customer, 10) };
          if (options.description) data.description = options.description;
        } else {
          data = await inquirer.prompt([
            { type: 'input', name: 'customer_id', message: 'Customer ID:' },
            { type: 'input', name: 'description', message: 'Description:' },
          ]);
          for (const key of Object.keys(data)) {
            if (!data[key]) delete data[key];
          }
          if (data.customer_id) data.customer_id = parseInt(data.customer_id, 10);
        }

        if (globalOpts.dryRun) {
          console.log(chalk.yellow('Dry run — would create:'));
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        const result = await api.create(data);
        console.log(chalk.green(`Estimate created (ID: ${result.id ?? result.data?.id ?? 'unknown'}).`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });
}

function initApi(globalOpts) {
  const profileName = getActiveProfileName(globalOpts.profile);
  const profileConfig = getProfileConfig(profileName);
  const client = createClient(profileName, { baseUrl: profileConfig.base_url, verbose: globalOpts.verbose });
  const api = createEstimatesApi(client);
  return { client, api };
}
