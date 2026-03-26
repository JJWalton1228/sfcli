import chalk from 'chalk';
import { createClient } from '../api/client.js';
import { getActiveProfileName, getProfileConfig } from '../config/index.js';

const ENDPOINTS = ['customers', 'jobs', 'estimates', 'techs', 'invoices'];

export function registerDiscoverCommands(program) {
  program
    .command('discover [entity]')
    .description('Discover API schema by fetching a sample record')
    .action(async (entity) => {
      const globalOpts = program.opts();
      const profileName = getActiveProfileName(globalOpts.profile);
      const profileConfig = getProfileConfig(profileName);
      const client = createClient(profileName, { baseUrl: profileConfig.base_url, verbose: globalOpts.verbose });

      const entities = entity ? [entity] : ENDPOINTS;

      for (const ent of entities) {
        console.log(chalk.bold(`\n  /${ent}`));
        try {
          const response = await client.get(`/${ent}`, { params: { page: 1 } });
          const data = response.data;
          const items = data.items ?? (Array.isArray(data) ? data : []);
          const expandable = data._expandable ?? [];
          const meta = data._meta;

          if (meta) {
            console.log(chalk.dim(`    Total: ${meta.totalCount} records, ${meta.pageCount} pages (${meta.perPage}/page)`));
          }

          if (expandable.length > 0) {
            console.log(chalk.magenta(`    Expandable: ${expandable.join(', ')}`));
          }

          if (items.length === 0) {
            console.log(chalk.yellow('    No records found (endpoint exists but returned empty).'));
            continue;
          }

          const sample = items[0];
          console.log(chalk.green('    Fields:'));
          for (const [key, value] of Object.entries(sample)) {
            if (key === '_expandable') continue;
            const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
            const preview = value === null ? 'null' : JSON.stringify(value).slice(0, 60);
            console.log(`    ${chalk.cyan(key)} (${chalk.dim(type)}): ${preview}`);
          }
        } catch (err) {
          if (err.message?.includes('not found') || err.response?.status === 404) {
            console.log(chalk.red('    Endpoint not available (404).'));
          } else {
            console.log(chalk.red(`    Error: ${err.message}`));
          }
        }
      }
      console.log();
    });
}
