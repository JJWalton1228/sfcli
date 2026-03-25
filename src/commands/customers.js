import chalk from 'chalk';
import { createClient } from '../api/client.js';
import { createCustomersApi } from '../api/customers.js';
import { getActiveProfileName, getProfileConfig } from '../config/index.js';
import { output, outputDetail } from '../utils/output.js';

const CUSTOMER_COLUMNS = ['id', 'customer_name', 'phone', 'email', 'city', 'state'];
const CUSTOMER_HEADERS = {
  id: 'ID',
  customer_name: 'Name',
  contact_first_name: 'First Name',
  contact_last_name: 'Last Name',
  phone: 'Phone',
  email: 'Email',
  city: 'City',
  state: 'State',
  zip_code: 'Zip',
  created_at: 'Created',
};

export function registerCustomerCommands(program) {
  const customers = program.command('customers').description('Manage customers');

  // --- list ---
  customers
    .command('list')
    .description('List customers')
    .option('--all', 'Fetch all pages')
    .option('--limit <n>', 'Limit results', parseInt)
    .action(async (options) => {
      const globalOpts = program.opts();
      try {
        const { client, api } = initApi(globalOpts);
        const items = await api.list({}, { all: options.all, limit: options.limit });
        output(items, {
          format: globalOpts.output,
          columns: CUSTOMER_COLUMNS,
          headers: CUSTOMER_HEADERS,
        });
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  // --- get ---
  customers
    .command('get <id>')
    .description('Get a customer by ID')
    .action(async (id) => {
      const globalOpts = program.opts();
      try {
        const { client, api } = initApi(globalOpts);
        const customer = await api.get(id);
        outputDetail(customer, {
          format: globalOpts.output,
          headers: CUSTOMER_HEADERS,
        });
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  // --- search ---
  customers
    .command('search [query]')
    .description('Search customers')
    .option('--phone <phone>', 'Search by phone')
    .option('--email <email>', 'Search by email')
    .option('--city <city>', 'Filter by city')
    .option('--state <state>', 'Filter by state')
    .option('--created-after <date>', 'Created after date')
    .option('--created-before <date>', 'Created before date')
    .option('--tag <tag>', 'Filter by tag')
    .action(async (query, options) => {
      const globalOpts = program.opts();
      try {
        const { client, api } = initApi(globalOpts);
        const params = {};
        if (query) params.q = query;
        if (options.phone) params.phone = options.phone;
        if (options.email) params.email = options.email;
        if (options.city) params.city = options.city;
        if (options.state) params.state = options.state;
        if (options.createdAfter) params.created_after = options.createdAfter;
        if (options.createdBefore) params.created_before = options.createdBefore;
        if (options.tag) params.tag = options.tag;

        const items = await api.search(params);
        output(items, {
          format: globalOpts.output,
          columns: CUSTOMER_COLUMNS,
          headers: CUSTOMER_HEADERS,
        });
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });
}

function initApi(globalOpts) {
  const profileName = getActiveProfileName(globalOpts.profile);
  const profileConfig = getProfileConfig(profileName);
  const client = createClient(profileName, {
    baseUrl: profileConfig.base_url,
    verbose: globalOpts.verbose,
  });
  const api = createCustomersApi(client);
  return { client, api };
}
