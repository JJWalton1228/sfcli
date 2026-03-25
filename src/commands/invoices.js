import chalk from 'chalk';
import { createClient } from '../api/client.js';
import { createInvoicesApi } from '../api/invoices.js';
import { getActiveProfileName, getProfileConfig } from '../config/index.js';
import { output, outputDetail } from '../utils/output.js';

const INVOICE_COLUMNS = ['id', 'job_id', 'customer_id', 'status', 'total', 'balance_due'];
const INVOICE_HEADERS = {
  id: 'ID',
  job_id: 'Job',
  customer_id: 'Customer',
  status: 'Status',
  total: 'Total',
  balance_due: 'Balance Due',
  created_at: 'Created',
};

export function registerInvoiceCommands(program) {
  const invoices = program.command('invoices').description('Manage invoices');

  invoices
    .command('list')
    .description('List invoices')
    .option('--all', 'Fetch all pages')
    .option('--limit <n>', 'Limit results', parseInt)
    .option('--status <status>', 'Filter by status')
    .option('--customer <id>', 'Filter by customer ID')
    .option('--overdue', 'Show only overdue invoices')
    .option('--created-after <date>', 'Created after date')
    .action(async (options) => {
      const globalOpts = program.opts();
      try {
        const { api } = initApi(globalOpts);
        const params = {};
        if (options.status) params.status = options.status;
        if (options.customer) params.customer_id = options.customer;
        if (options.overdue) params.overdue = true;
        if (options.createdAfter) params.created_after = options.createdAfter;
        const items = await api.list(params, { all: options.all, limit: options.limit });
        output(items, { format: globalOpts.output, columns: INVOICE_COLUMNS, headers: INVOICE_HEADERS });
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  invoices
    .command('get <id>')
    .description('Get an invoice by ID')
    .action(async (id) => {
      const globalOpts = program.opts();
      try {
        const { api } = initApi(globalOpts);
        const invoice = await api.get(id);
        outputDetail(invoice, { format: globalOpts.output, headers: INVOICE_HEADERS });
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
  const api = createInvoicesApi(client);
  return { client, api };
}
