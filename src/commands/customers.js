import chalk from 'chalk';
import inquirer from 'inquirer';
import { readFileSync } from 'fs';
import { createClient } from '../api/client.js';
import { createCustomersApi, flattenCustomer } from '../api/customers.js';
import { getActiveProfileName, getProfileConfig } from '../config/index.js';
import { output, outputDetail } from '../utils/output.js';
import { createCache } from '../utils/cache.js';
import { createCacheAwareSearch } from '../utils/cache-search.js';
import { fetchAll } from '../utils/paginator.js';

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
          format: globalOpts.output, sort: globalOpts.sort,
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
          format: globalOpts.output, sort: globalOpts.sort,
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
        const filters = {};
        if (query) filters.q = query;
        if (options.phone) filters.phone = options.phone;
        if (options.email) filters.email = options.email;
        if (options.city) filters.city = options.city;
        if (options.state) filters.state = options.state;

        // Use cache-aware search
        const db = createCache();
        const apiFetcher = async () => {
          const raw = await fetchAll(client, '/customers', {
            expand: 'contacts,contacts.phones,contacts.emails,locations',
          });
          return raw.map(c => ({
            ...flattenCustomer(c),
            contacts: c.contacts,
            locations: c.locations,
          }));
        };
        const search = createCacheAwareSearch(db, 'customers', apiFetcher);
        const items = await search(filters, { noCache: globalOpts.cache === false });
        db.close();

        output(items, {
          format: globalOpts.output, sort: globalOpts.sort,
          columns: CUSTOMER_COLUMNS,
          headers: CUSTOMER_HEADERS,
        });
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  // --- create ---
  customers
    .command('create')
    .description('Create a customer')
    .option('--json <data>', 'JSON data string')
    .option('--from-file <path>', 'Read JSON from file')
    .action(async (options) => {
      const globalOpts = program.opts();
      try {
        const { api } = initApi(globalOpts);
        let data;

        if (options.fromFile) {
          data = JSON.parse(readFileSync(options.fromFile, 'utf8'));
        } else if (options.json) {
          data = JSON.parse(options.json);
        } else {
          // Interactive prompts
          data = await inquirer.prompt([
            { type: 'input', name: 'customer_name', message: 'Customer name:' },
            { type: 'input', name: 'contact_first_name', message: 'Contact first name:' },
            { type: 'input', name: 'contact_last_name', message: 'Contact last name:' },
            { type: 'input', name: 'phone', message: 'Phone:' },
            { type: 'input', name: 'email', message: 'Email:' },
            { type: 'input', name: 'street_1', message: 'Street:' },
            { type: 'input', name: 'city', message: 'City:' },
            { type: 'input', name: 'state', message: 'State:' },
            { type: 'input', name: 'zip_code', message: 'Zip code:' },
          ]);
          // Remove empty values
          for (const key of Object.keys(data)) {
            if (!data[key]) delete data[key];
          }
        }

        if (globalOpts.dryRun) {
          console.log(chalk.yellow('Dry run — would create:'));
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        const result = await api.create(data);
        console.log(chalk.green(`Customer created (ID: ${result.id ?? result.data?.id ?? 'unknown'}).`));
        outputDetail(result.data ?? result, { format: globalOpts.output, sort: globalOpts.sort, headers: CUSTOMER_HEADERS });
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  // --- update ---
  customers
    .command('update <id>')
    .description('Update a customer')
    .option('--set <field=value...>', 'Set field values (repeatable)', collect, [])
    .option('--json <data>', 'JSON data string')
    .action(async (id, options) => {
      const globalOpts = program.opts();
      try {
        const { api } = initApi(globalOpts);
        let data;

        if (options.json) {
          data = JSON.parse(options.json);
        } else if (options.set.length > 0) {
          data = {};
          for (const pair of options.set) {
            const eqIdx = pair.indexOf('=');
            if (eqIdx === -1) throw new Error(`Invalid --set format: "${pair}". Use field=value.`);
            data[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
          }
        } else {
          console.error(chalk.red('Provide --set field=value or --json to update.'));
          process.exitCode = 1;
          return;
        }

        if (globalOpts.dryRun) {
          console.log(chalk.yellow(`Dry run — would update customer ${id}:`));
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        const result = await api.update(id, data);
        console.log(chalk.green(`Customer ${id} updated.`));
        outputDetail(result.data ?? result, { format: globalOpts.output, sort: globalOpts.sort, headers: CUSTOMER_HEADERS });
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });
}

function collect(value, previous) {
  return previous.concat([value]);
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
