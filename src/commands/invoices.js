import chalk from 'chalk';
import { createClient } from '../api/client.js';
import { createInvoicesApi } from '../api/invoices.js';
import { getActiveProfileName, getProfileConfig } from '../config/index.js';
import { output, outputDetail } from '../utils/output.js';

const INVOICE_COLUMNS = ['number', 'customer', 'is_paid', 'total', 'date'];
const INVOICE_HEADERS = {
  id: 'ID',
  number: 'Inv #',
  customer: 'Customer',
  is_paid: 'Paid',
  total: 'Total',
  date: 'Date',
  terms: 'Terms',
  po_number: 'PO #',
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
        output(items, { format: globalOpts.output, sort: globalOpts.sort, columns: INVOICE_COLUMNS, headers: INVOICE_HEADERS });
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
        outputDetail(invoice, { format: globalOpts.output, sort: globalOpts.sort, headers: INVOICE_HEADERS });
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
