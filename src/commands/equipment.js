import chalk from 'chalk';
import { createClient } from '../api/client.js';
import { createEquipmentApi } from '../api/equipment.js';
import { getActiveProfileName, getProfileConfig } from '../config/index.js';
import { output, outputDetail } from '../utils/output.js';
import { createCache } from '../utils/cache.js';
import { createCacheAwareSearch } from '../utils/cache-search.js';

const EQUIP_COLUMNS = ['id', 'type', 'make', 'model', 'serial_number', 'location'];
const EQUIP_HEADERS = {
  id: 'ID',
  type: 'Type',
  make: 'Make',
  model: 'Model',
  serial_number: 'Serial #',
  sku: 'SKU',
  location: 'Location',
  notes: 'Notes',
  customer_id: 'Customer ID',
  install_date: 'Installed',
  warranty_date: 'Warranty',
  created_at: 'Created',
};

export function registerEquipmentCommands(program) {
  const equipment = program.command('equipment').description('Manage equipment (nested under customers)');

  equipment
    .command('list')
    .description('List equipment for a customer')
    .requiredOption('--customer <id>', 'Customer ID (required)')
    .option('--all', 'Fetch all pages')
    .option('--limit <n>', 'Limit results', parseInt)
    .action(async (options) => {
      const globalOpts = program.opts();
      try {
        const { api } = initApi(globalOpts);
        const db = createCache();
        const apiFetcher = async () =>
          api.listForCustomer(options.customer, {}, { all: true });
        const search = createCacheAwareSearch(db, 'equipment', apiFetcher, { staleWhileRevalidate: true });
        let items = await search({ customer_id: Number(options.customer) }, { noCache: globalOpts.cache === false });
        db.close();

        if (options.limit) items = items.slice(0, options.limit);
        output(items, { format: globalOpts.output, sort: globalOpts.sort, columns: EQUIP_COLUMNS, headers: EQUIP_HEADERS });
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  equipment
    .command('get <equipmentId>')
    .description('Get equipment by ID')
    .requiredOption('--customer <id>', 'Customer ID (required)')
    .action(async (equipmentId, options) => {
      const globalOpts = program.opts();
      try {
        const { api } = initApi(globalOpts);
        const item = await api.get(options.customer, equipmentId);
        outputDetail(item, { format: globalOpts.output, sort: globalOpts.sort, headers: EQUIP_HEADERS });
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  equipment
    .command('search <query>')
    .description('Search equipment for a customer')
    .requiredOption('--customer <id>', 'Customer ID (required)')
    .action(async (query, options) => {
      const globalOpts = program.opts();
      try {
        const { api } = initApi(globalOpts);
        const db = createCache();
        const apiFetcher = async () =>
          api.listForCustomer(options.customer, {}, { all: true });
        const search = createCacheAwareSearch(db, 'equipment', apiFetcher, { staleWhileRevalidate: true });
        const items = await search(
          { customer_id: Number(options.customer), q: query },
          { noCache: globalOpts.cache === false },
        );
        db.close();
        output(items, { format: globalOpts.output, sort: globalOpts.sort, columns: EQUIP_COLUMNS, headers: EQUIP_HEADERS });
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
  const api = createEquipmentApi(client);
  return { client, api };
}
