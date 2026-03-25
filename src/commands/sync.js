import chalk from 'chalk';
import inquirer from 'inquirer';
import { writeFileSync, copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '../api/client.js';
import { getActiveProfileName, getProfileConfig, getConfig, getConfigDir } from '../config/index.js';
import { FileMakerClient } from '../filemaker/client.js';
import { loadMapping, getEntityMapping } from '../filemaker/mapper.js';
import { pull, push, syncBidirectional, getSyncStatus, getSyncLog } from '../filemaker/sync-engine.js';
import { listConflicts, resolveConflict } from '../filemaker/conflict-resolver.js';
import { output } from '../utils/output.js';

const ENTITY_TYPES = ['customers', 'jobs', 'estimates', 'technicians', 'equipment', 'invoices'];

export function registerSyncCommands(program) {
  const sync = program.command('sync').description('FileMaker sync bridge');

  // --- fm-test ---
  sync
    .command('fm-test')
    .description('Test FileMaker connection')
    .action(async () => {
      try {
        const fm = await createFmClient();
        console.log(chalk.green('FileMaker connection successful.'));
        await fm.disconnect();
      } catch (err) {
        console.error(chalk.red(`FileMaker connection failed: ${err.message}`));
        process.exitCode = 1;
      }
    });

  // --- pull ---
  sync
    .command('pull <entity>')
    .description('Pull: Service Fusion → FileMaker')
    .option('--since <date>', 'Only records updated since date')
    .option('--status <status>', 'Filter by status (jobs)')
    .action(async (entity, options) => {
      const globalOpts = program.opts();
      let fmClient;
      try {
        const entities = entity === 'all' ? ENTITY_TYPES : [entity];
        const sfClient = initSfClient(globalOpts);
        fmClient = await createFmClient();
        const mapping = loadMapping();
        const strategy = getConfig().get('defaults.sync_conflict_strategy') || null;

        for (const ent of entities) {
          const entityMapping = getEntityMapping(mapping, ent);
          const stats = await pull(sfClient, fmClient, ent, entityMapping, {
            since: options.since,
            dryRun: globalOpts.dryRun,
            conflictStrategy: strategy,
          });
          printStats('Pull', ent, stats, globalOpts.dryRun);
        }
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      } finally {
        if (fmClient) await fmClient.disconnect();
      }
    });

  // --- push ---
  sync
    .command('push <entity>')
    .description('Push: FileMaker → Service Fusion')
    .action(async (entity) => {
      const globalOpts = program.opts();
      let fmClient;
      try {
        const entities = entity === 'all' ? ENTITY_TYPES : [entity];
        const sfClient = initSfClient(globalOpts);
        fmClient = await createFmClient();
        const mapping = loadMapping();

        for (const ent of entities) {
          const entityMapping = getEntityMapping(mapping, ent);
          const stats = await push(sfClient, fmClient, ent, entityMapping, {
            dryRun: globalOpts.dryRun,
          });
          printStats('Push', ent, stats, globalOpts.dryRun);
        }
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      } finally {
        if (fmClient) await fmClient.disconnect();
      }
    });

  // --- run (bidirectional) ---
  sync
    .command('run <entity>')
    .description('Bidirectional sync')
    .option('--since <date>', 'Only records updated since date')
    .action(async (entity, options) => {
      const globalOpts = program.opts();
      let fmClient;
      try {
        const entities = entity === 'all' ? ENTITY_TYPES : [entity];
        const sfClient = initSfClient(globalOpts);
        fmClient = await createFmClient();
        const mapping = loadMapping();
        const strategy = getConfig().get('defaults.sync_conflict_strategy') || null;

        for (const ent of entities) {
          const entityMapping = getEntityMapping(mapping, ent);
          const result = await syncBidirectional(sfClient, fmClient, ent, entityMapping, {
            since: options.since,
            dryRun: globalOpts.dryRun,
            conflictStrategy: strategy,
          });
          printStats('Pull', ent, result.pull, globalOpts.dryRun);
          printStats('Push', ent, result.push, globalOpts.dryRun);
        }
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      } finally {
        if (fmClient) await fmClient.disconnect();
      }
    });

  // --- status ---
  sync
    .command('status')
    .description('Show last sync times')
    .action(() => {
      const globalOpts = program.opts();
      const status = getSyncStatus();
      if (Object.keys(status).length === 0) {
        console.log(chalk.yellow('No sync history. Run `sfcli sync pull` or `sfcli sync run` first.'));
        return;
      }
      const rows = Object.entries(status).map(([entity, times]) => ({
        entity,
        last_pull: times.last_pull || '-',
        last_push: times.last_push || '-',
      }));
      output(rows, {
        format: globalOpts.output,
        columns: ['entity', 'last_pull', 'last_push'],
        headers: { entity: 'Entity', last_pull: 'Last Pull', last_push: 'Last Push' },
      });
    });

  // --- log ---
  sync
    .command('log')
    .description('Show sync history')
    .option('--limit <n>', 'Number of entries', parseInt, 20)
    .action((options) => {
      const globalOpts = program.opts();
      const log = getSyncLog(options.limit);
      if (log.length === 0) {
        console.log(chalk.yellow('No sync log entries.'));
        return;
      }
      const rows = log.map((e) => ({
        timestamp: e.timestamp,
        direction: e.direction,
        entity: e.entityType,
        created: e.stats?.created ?? 0,
        updated: e.stats?.updated ?? 0,
        conflicts: e.stats?.conflicts ?? 0,
        errors: e.stats?.errors ?? 0,
        dry_run: e.dryRun ? 'yes' : '',
      }));
      output(rows, {
        format: globalOpts.output,
        columns: ['timestamp', 'direction', 'entity', 'created', 'updated', 'conflicts', 'errors', 'dry_run'],
        headers: { timestamp: 'Time', direction: 'Dir', entity: 'Entity', created: 'New', updated: 'Updated', conflicts: 'Conflicts', errors: 'Errors', dry_run: 'Dry?' },
      });
    });

  // --- conflicts ---
  sync
    .command('conflicts')
    .description('Show unresolved sync conflicts')
    .action(() => {
      const globalOpts = program.opts();
      const conflicts = listConflicts();
      if (conflicts.length === 0) {
        console.log(chalk.green('No unresolved conflicts.'));
        return;
      }
      const rows = conflicts.map((c) => ({
        id: c.id,
        entity: c.entity_type,
        sf_id: c.sf_id,
        detected: c.detected_at,
      }));
      output(rows, {
        format: globalOpts.output,
        columns: ['id', 'entity', 'sf_id', 'detected'],
        headers: { id: 'Conflict ID', entity: 'Entity', sf_id: 'SF ID', detected: 'Detected' },
      });
    });

  // --- resolve ---
  sync
    .command('resolve <conflictId>')
    .description('Resolve a sync conflict')
    .requiredOption('--use <side>', 'Which side wins: sf or fm')
    .action(async (conflictId, options) => {
      try {
        if (options.use !== 'sf' && options.use !== 'fm') {
          throw new Error('--use must be "sf" or "fm"');
        }
        const { conflict } = resolveConflict(conflictId, options.use);
        console.log(chalk.green(`Conflict ${conflictId} resolved: ${options.use} wins (${conflict.entity_type} SF#${conflict.sf_id}).`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  // --- mapping show ---
  const mapping = sync.command('mapping').description('Field mapping management');

  mapping
    .command('show')
    .description('Display current field mappings')
    .action(() => {
      try {
        const map = loadMapping();
        console.log(JSON.stringify(map, null, 2));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  mapping
    .command('validate')
    .description('Validate mappings against both APIs')
    .action(async () => {
      try {
        const map = loadMapping();
        console.log(chalk.bold('Mapping validation:'));
        for (const [entity, config] of Object.entries(map)) {
          const issues = [];
          if (!config.sf_endpoint) issues.push('missing sf_endpoint');
          if (!config.fm_layout) issues.push('missing fm_layout');
          if (!config.id_field?.sf || !config.id_field?.fm) issues.push('missing id_field');
          if (!config.field_map || Object.keys(config.field_map).length === 0) issues.push('empty field_map');

          if (issues.length > 0) {
            console.log(`  ${chalk.red('x')} ${entity}: ${issues.join(', ')}`);
          } else {
            const fieldCount = Object.keys(config.field_map).length;
            console.log(`  ${chalk.green('✓')} ${entity}: ${fieldCount} fields mapped → ${config.fm_layout}`);
          }
        }
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  mapping
    .command('init')
    .description('Create default fm-mapping.json')
    .action(async () => {
      const dest = join(process.cwd(), 'fm-mapping.json');
      if (existsSync(dest)) {
        const { overwrite } = await inquirer.prompt([
          { type: 'confirm', name: 'overwrite', message: 'fm-mapping.json already exists. Overwrite?', default: false },
        ]);
        if (!overwrite) return;
      }
      // Copy default mapping from package
      const src = join(dirname(fileURLToPath(import.meta.url)), '../../fm-mapping.json');
      if (existsSync(src)) {
        copyFileSync(src, dest);
      } else {
        // Write inline default
        writeFileSync(dest, JSON.stringify(getDefaultMapping(), null, 2));
      }
      console.log(chalk.green(`Created fm-mapping.json. Edit it to match your FileMaker schema.`));
    });
}

function initSfClient(globalOpts) {
  const profileName = getActiveProfileName(globalOpts.profile);
  const profileConfig = getProfileConfig(profileName);
  return createClient(profileName, { baseUrl: profileConfig.base_url, verbose: globalOpts.verbose });
}

async function createFmClient() {
  const config = getConfig();
  const fm = config.get('filemaker') || {};
  const host = fm.host || process.env.FM_HOST;
  const database = fm.database || process.env.FM_DATABASE;
  const username = fm.username || process.env.FM_USERNAME;
  const password = fm.password || process.env.FM_PASSWORD;

  if (!host || !database || !username || !password) {
    throw new Error(
      'FileMaker not configured. Set FM_HOST, FM_DATABASE, FM_USERNAME, FM_PASSWORD in .env or run `sfcli sync fm-setup`.'
    );
  }

  const client = new FileMakerClient({ host, database, username, password });
  await client.connect();
  return client;
}

function printStats(direction, entity, stats, dryRun) {
  const prefix = dryRun ? chalk.yellow('[dry-run] ') : '';
  const parts = [];
  if (stats.created) parts.push(chalk.green(`${stats.created} created`));
  if (stats.updated) parts.push(chalk.cyan(`${stats.updated} updated`));
  if (stats.conflicts) parts.push(chalk.yellow(`${stats.conflicts} conflicts`));
  if (stats.errors) parts.push(chalk.red(`${stats.errors} errors`));
  if (stats.skipped) parts.push(chalk.dim(`${stats.skipped} skipped`));
  if (parts.length === 0) parts.push(chalk.dim('no changes'));
  console.log(`${prefix}${chalk.bold(direction)} ${entity}: ${parts.join(', ')}`);
}

function getDefaultMapping() {
  return {
    customers: { sf_endpoint: "/customers", fm_layout: "API_Customers", id_field: { sf: "id", fm: "SF_CustomerID" }, last_sync_field: "SF_LastSync", field_map: { customer_name: "CompanyName", phone: "Phone", email: "Email" } },
  };
}
