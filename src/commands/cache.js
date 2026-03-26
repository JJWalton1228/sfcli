import chalk from 'chalk';
import { createCache } from '../utils/cache.js';
import { createClient } from '../api/client.js';
import { createCustomersApi, flattenCustomer } from '../api/customers.js';
import { createJobsApi } from '../api/jobs.js';
import { createEstimatesApi } from '../api/estimates.js';
import { createInvoicesApi } from '../api/invoices.js';
import { createTechniciansApi } from '../api/technicians.js';
import { createEquipmentApi } from '../api/equipment.js';
import { getActiveProfileName, getProfileConfig } from '../config/index.js';
import { fetchAll } from '../utils/paginator.js';
import { createSpinner } from '../utils/spinner.js';

const ENTITIES = ['customers', 'jobs', 'estimates', 'invoices', 'techs', 'equipment'];

export function registerCacheCommands(program) {
  const cache = program.command('cache').description('Manage local data cache');

  cache
    .command('refresh [entity]')
    .description('Refresh cached data from Service Fusion API')
    .action(async (entity) => {
      const globalOpts = program.opts();
      try {
        const entitiesToRefresh = entity ? [entity] : ENTITIES;
        for (const e of entitiesToRefresh) {
          if (!ENTITIES.includes(e)) {
            console.error(chalk.red(`Unknown entity: ${e}. Valid: ${ENTITIES.join(', ')}`));
            process.exitCode = 1;
            return;
          }
        }

        const profileName = getActiveProfileName(globalOpts.profile);
        const profileConfig = getProfileConfig(profileName);
        const client = createClient(profileName, { baseUrl: profileConfig.base_url, verbose: globalOpts.verbose });
        const db = createCache();

        for (const e of entitiesToRefresh) {
          await refreshEntity(client, db, e);
        }

        db.close();
        console.log(chalk.green('Cache refresh complete.'));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  cache
    .command('status')
    .description('Show cache status per entity')
    .action(() => {
      try {
        const db = createCache();
        console.log(chalk.bold('\n  Cache Status'));
        console.log(chalk.dim('  ' + '-'.repeat(50)));

        for (const e of ENTITIES) {
          const s = db.status(e);
          const age = s.refreshedAt
            ? `refreshed ${s.refreshedAt}`
            : 'never refreshed';
          const staleTag = s.stale ? chalk.yellow(' (stale)') : chalk.green(' (fresh)');
          console.log(`  ${chalk.cyan(e.padEnd(12))} ${String(s.count).padStart(6)} records  ${age}${staleTag}`);
        }

        console.log();
        db.close();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  cache
    .command('clear [entity]')
    .description('Clear cached data')
    .action((entity) => {
      try {
        const db = createCache();
        db.clear(entity || undefined);
        db.close();
        console.log(chalk.green(entity ? `Cache cleared for ${entity}.` : 'All cache cleared.'));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });
}

/**
 * Refresh a single entity's cache from the SF API.
 */
async function refreshEntity(client, db, entity) {
  const spinner = createSpinner(`Refreshing ${entity}...`);
  spinner.start();

  try {
    let items;

    if (entity === 'customers') {
      items = await fetchAll(client, '/customers', {
        expand: 'contacts,contacts.phones,contacts.emails,locations',
      }, { maxPages: 10000 });
      // Store raw (with nested data) and also flatten for search
      const flattened = items.map(c => ({
        ...flattenCustomer(c),
        contacts: c.contacts,
        locations: c.locations,
      }));
      db.putMany('customers', flattened);
    } else if (entity === 'jobs') {
      items = await fetchAll(client, '/jobs', {}, { maxPages: 10000 });
      db.putMany('jobs', items);
    } else if (entity === 'estimates') {
      items = await fetchAll(client, '/estimates', {}, { maxPages: 10000 });
      db.putMany('estimates', items);
    } else if (entity === 'invoices') {
      items = await fetchAll(client, '/invoices', {}, { maxPages: 10000 });
      db.putMany('invoices', items);
    } else if (entity === 'techs') {
      items = await fetchAll(client, '/techs', {}, { maxPages: 10000 });
      db.putMany('techs', items);
    } else if (entity === 'equipment') {
      // Equipment is nested under customers — iterate all cached customers
      const customerStatus = db.status('customers');
      if (customerStatus.count === 0) {
        spinner.stop();
        console.log(chalk.yellow(`  ${entity}: skipped (refresh customers first)`));
        return;
      }
      // Get all customer IDs from cache
      const allCustomers = db.search('customers', {});
      const allEquipment = [];
      let processed = 0;
      for (const cust of allCustomers) {
        processed++;
        if (processed % 100 === 0) {
          spinner.text = `Refreshing equipment... (${processed}/${allCustomers.length} customers, ${allEquipment.length} items)`;
        }
        try {
          const equipItems = await fetchAll(client, `/customers/${cust.id}/equipment`, {}, { maxPages: 100, showProgress: false });
          allEquipment.push(...equipItems);
        } catch {
          // Some customers may have no equipment endpoint — skip silently
        }
      }
      items = allEquipment;
      if (items.length > 0) {
        db.putMany('equipment', items);
      }
    }

    spinner.stop();
    console.log(chalk.green(`  ${entity}: ${items.length} records cached`));
  } catch (err) {
    spinner.stop();
    console.error(chalk.red(`  ${entity}: failed — ${err.message}`));
  }
}
