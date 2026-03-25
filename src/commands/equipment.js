import chalk from 'chalk';
import { createClient } from '../api/client.js';
import { createEquipmentApi } from '../api/equipment.js';
import { getActiveProfileName, getProfileConfig } from '../config/index.js';
import { output, outputDetail } from '../utils/output.js';

const EQUIP_COLUMNS = ['id', 'customer_id', 'name', 'model', 'serial', 'location'];
const EQUIP_HEADERS = {
  id: 'ID',
  customer_id: 'Customer',
  name: 'Name',
  model: 'Model',
  serial: 'Serial',
  location: 'Location',
};

export function registerEquipmentCommands(program) {
  const equipment = program.command('equipment').description('Manage equipment');

  equipment
    .command('list')
    .description('List equipment')
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
        output(items, { format: globalOpts.output, columns: EQUIP_COLUMNS, headers: EQUIP_HEADERS });
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  equipment
    .command('get <id>')
    .description('Get equipment by ID')
    .action(async (id) => {
      const globalOpts = program.opts();
      try {
        const { api } = initApi(globalOpts);
        const item = await api.get(id);
        outputDetail(item, { format: globalOpts.output, headers: EQUIP_HEADERS });
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  equipment
    .command('search <query>')
    .description('Search equipment')
    .action(async (query) => {
      const globalOpts = program.opts();
      try {
        const { api } = initApi(globalOpts);
        const items = await api.search({ q: query });
        output(items, { format: globalOpts.output, columns: EQUIP_COLUMNS, headers: EQUIP_HEADERS });
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
