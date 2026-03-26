import chalk from 'chalk';
import { createClient } from '../api/client.js';
import { createTechniciansApi } from '../api/technicians.js';
import { getActiveProfileName, getProfileConfig } from '../config/index.js';
import { output, outputDetail } from '../utils/output.js';

const TECH_COLUMNS = ['id', 'first_name', 'last_name', 'email', 'phone_1', 'department'];
const TECH_HEADERS = {
  id: 'ID',
  first_name: 'First Name',
  last_name: 'Last Name',
  email: 'Email',
  phone_1: 'Phone',
  phone_2: 'Phone 2',
  department: 'Dept',
  title: 'Title',
  color_code: 'Color',
  is_field_worker: 'Field Worker',
  is_sales_rep: 'Sales Rep',
};

export function registerTechnicianCommands(program) {
  const techs = program.command('techs').description('Manage technicians');

  techs
    .command('list')
    .description('List technicians')
    .option('--all', 'Fetch all pages')
    .option('--limit <n>', 'Limit results', parseInt)
    .action(async (options) => {
      const globalOpts = program.opts();
      try {
        const { api } = initApi(globalOpts);
        const items = await api.list({}, { all: options.all, limit: options.limit });
        output(items, { format: globalOpts.output, sort: globalOpts.sort, columns: TECH_COLUMNS, headers: TECH_HEADERS });
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  techs
    .command('get <id>')
    .description('Get a technician by ID')
    .action(async (id) => {
      const globalOpts = program.opts();
      try {
        const { api } = initApi(globalOpts);
        const tech = await api.get(id);
        outputDetail(tech, { format: globalOpts.output, sort: globalOpts.sort, headers: TECH_HEADERS });
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
  const api = createTechniciansApi(client);
  return { client, api };
}
