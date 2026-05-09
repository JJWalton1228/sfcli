import chalk from 'chalk';
import inquirer from 'inquirer';
import { createClient } from '../api/client.js';
import { createEstimatesApi } from '../api/estimates.js';
import { getActiveProfileName, getProfileConfig } from '../config/index.js';
import { output, outputDetail } from '../utils/output.js';
import { createCache } from '../utils/cache.js';
import { createCacheAwareSearch } from '../utils/cache-search.js';

const ESTIMATE_COLUMNS = ['number', 'customer_name', 'status', 'description', 'total'];
const ESTIMATE_HEADERS = {
  id: 'ID',
  number: 'Est #',
  customer_id: 'Cust ID',
  customer_name: 'Customer',
  status: 'Status',
  description: 'Description',
  total: 'Total',
  due_total: 'Due',
  city: 'City',
  state_prov: 'State',
  created_at: 'Created',
};

export function registerEstimateCommands(program) {
  const estimates = program.command('estimates').description('Manage estimates');

  estimates
    .command('list')
    .description('List estimates')
    .option('--status <status>', 'Filter by status')
    .option('--customer <name>', 'Filter by customer name')
    .option('--date-range <range>', 'Filter by date range (YYYY-MM-DD..YYYY-MM-DD)')
    .option('--limit <n>', 'Limit results', parseInt)
    .option('--select <fields>', 'Select specific fields (comma-separated)')
    .action(async (options) => {
      const globalOpts = program.opts();
      try {
        const filters = {};
        if (options.status) filters.status = options.status;
        if (options.customer) filters.customerName = options.customer;
        if (options.dateRange) {
          const [from, to] = options.dateRange.split('..');
          if (from) filters.dateFrom = from;
          if (to) filters.dateTo = to;
        }

        const ec = (await import('../cache/index.js')).getEntityCache(globalOpts);
        let items = await ec.findCached('estimates', filters, { noCache: globalOpts.cache === false });

        if (options.limit) items = items.slice(0, options.limit);
        output(items, { format: globalOpts.output, sort: globalOpts.sort, columns: ESTIMATE_COLUMNS, headers: ESTIMATE_HEADERS, select: options.select });
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
        outputDetail(estimate, { format: globalOpts.output, sort: globalOpts.sort, headers: ESTIMATE_HEADERS });
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
        output(items, { format: globalOpts.output, sort: globalOpts.sort, columns: ESTIMATE_COLUMNS, headers: ESTIMATE_HEADERS, select: options.select });
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
          const custId = parseInt(options.customer, 10);
          if (Number.isNaN(custId)) throw new Error('Invalid customer ID: must be a number');
          data = { customer_id: custId };
          if (options.description) data.description = options.description;
        } else {
          data = await inquirer.prompt([
            { type: 'input', name: 'customer_id', message: 'Customer ID:' },
            { type: 'input', name: 'description', message: 'Description:' },
          ]);
          for (const key of Object.keys(data)) {
            if (!data[key]) delete data[key];
          }
          if (data.customer_id) {
            const parsed = parseInt(data.customer_id, 10);
            if (Number.isNaN(parsed)) throw new Error('Invalid customer ID: must be a number');
            data.customer_id = parsed;
          }
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
