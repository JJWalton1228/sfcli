import chalk from 'chalk';
import { createCache } from '../utils/cache.js';
import { createClient } from '../api/client.js';
import { getActiveProfileName, getProfileConfig } from '../config/index.js';
import { createSpinner } from '../utils/spinner.js';
import { refreshEntity as refreshCacheEntity, ENTITY_NAMES } from '../cache/refreshers.js';

const ENTITIES = ENTITY_NAMES;

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
 * Thin wrapper that adds spinner + error reporting around the shared helper.
 */
async function refreshEntity(client, db, entity) {
  const spinner = createSpinner(`Refreshing ${entity}...`);
  spinner.start();

  try {
    const count = await refreshCacheEntity(client, db, entity, {
      onProgress: (text) => { spinner.text = text; },
    });
    spinner.stop();
    if (entity === 'equipment' && count === 0 && db.status('customers').count === 0) {
      console.log(chalk.yellow(`  ${entity}: skipped (refresh customers first)`));
    } else {
      console.log(chalk.green(`  ${entity}: ${count} records cached`));
    }
  } catch (err) {
    spinner.stop();
    console.error(chalk.red(`  ${entity}: failed — ${err.message}`));
  }
}
