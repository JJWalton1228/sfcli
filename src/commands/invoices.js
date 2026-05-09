import chalk from 'chalk';
import { createClient } from '../api/client.js';
import { createInvoicesApi } from '../api/invoices.js';
import { getActiveProfileName, getProfileConfig } from '../config/index.js';
import { output, outputDetail } from '../utils/output.js';
import { createCache } from '../utils/cache.js';
import { createCacheAwareSearch } from '../utils/cache-search.js';

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
    .option('--paid', 'Show only paid invoices')
    .option('--unpaid', 'Show only unpaid invoices')
    .option('--customer <name>', 'Filter by customer name')
    .option('--date-range <range>', 'Filter by date range (YYYY-MM-DD..YYYY-MM-DD)')
    .option('--min-total <n>', 'Minimum total', parseFloat)
    .option('--max-total <n>', 'Maximum total', parseFloat)
    .option('--select <fields>', 'Select specific fields (comma-separated)')
    .action(async (options) => {
      const globalOpts = program.opts();
      try {
        const filters = {};
        if (options.paid) filters.paid = true;
        if (options.unpaid) filters.paid = false;
        if (options.customer) filters.customerName = options.customer;
        if (options.dateRange) {
          const [from, to] = options.dateRange.split('..');
          if (from) filters.dateFrom = from;
          if (to) filters.dateTo = to;
        }
        if (options.minTotal !== undefined) filters.minTotal = options.minTotal;
        if (options.maxTotal !== undefined) filters.maxTotal = options.maxTotal;

        const ec = (await import('../cache/index.js')).getEntityCache(globalOpts);
        let items = await ec.findCached('invoices', filters, { noCache: globalOpts.cache === false });

        if (options.limit) items = items.slice(0, options.limit);
        output(items, { format: globalOpts.output, sort: globalOpts.sort, columns: INVOICE_COLUMNS, headers: INVOICE_HEADERS, select: options.select });
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
