import chalk from 'chalk';
import inquirer from 'inquirer';
import dayjs from 'dayjs';
import { readFileSync } from 'fs';
import { createClient } from '../api/client.js';
import { createJobsApi } from '../api/jobs.js';
import { getActiveProfileName, getProfileConfig } from '../config/index.js';
import { output, outputDetail } from '../utils/output.js';

const JOB_COLUMNS = ['id', 'customer_id', 'status', 'description', 'scheduled_start', 'total'];
const JOB_HEADERS = {
  id: 'ID',
  customer_id: 'Customer',
  status: 'Status',
  description: 'Description',
  job_type: 'Type',
  scheduled_start: 'Scheduled',
  scheduled_end: 'End',
  total: 'Total',
  created_at: 'Created',
};

export function registerJobCommands(program) {
  const jobs = program.command('jobs').description('Manage jobs');

  // --- list ---
  jobs
    .command('list')
    .description('List jobs')
    .option('--all', 'Fetch all pages')
    .option('--limit <n>', 'Limit results', parseInt)
    .option('--status <status>', 'Filter by status')
    .option('--customer <id>', 'Filter by customer ID')
    .option('--technician <id>', 'Filter by technician ID')
    .option('--scheduled-after <date>', 'Scheduled after date')
    .option('--scheduled-before <date>', 'Scheduled before date')
    .option('--completed-after <date>', 'Completed after date')
    .option('--completed-before <date>', 'Completed before date')
    .action(async (options) => {
      const globalOpts = program.opts();
      try {
        const { api } = initApi(globalOpts);
        const params = {};
        if (options.status) params.status = options.status;
        if (options.customer) params.customer_id = options.customer;
        if (options.technician) params.technician_id = options.technician;
        if (options.scheduledAfter) params.scheduled_after = options.scheduledAfter;
        if (options.scheduledBefore) params.scheduled_before = options.scheduledBefore;
        if (options.completedAfter) params.completed_after = options.completedAfter;
        if (options.completedBefore) params.completed_before = options.completedBefore;

        const items = await api.list(params, { all: options.all, limit: options.limit });
        output(items, { format: globalOpts.output, columns: JOB_COLUMNS, headers: JOB_HEADERS });
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  // --- today ---
  jobs
    .command('today')
    .description("Today's scheduled jobs")
    .action(async () => {
      const globalOpts = program.opts();
      try {
        const { api } = initApi(globalOpts);
        const today = dayjs().format('YYYY-MM-DD');
        const items = await api.search({
          scheduled_after: today,
          scheduled_before: dayjs().add(1, 'day').format('YYYY-MM-DD'),
        });
        output(items, { format: globalOpts.output, columns: JOB_COLUMNS, headers: JOB_HEADERS });
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  // --- this-week ---
  jobs
    .command('this-week')
    .description("This week's jobs")
    .action(async () => {
      const globalOpts = program.opts();
      try {
        const { api } = initApi(globalOpts);
        const start = dayjs().startOf('week').format('YYYY-MM-DD');
        const end = dayjs().endOf('week').format('YYYY-MM-DD');
        const items = await api.search({ scheduled_after: start, scheduled_before: end });
        output(items, { format: globalOpts.output, columns: JOB_COLUMNS, headers: JOB_HEADERS });
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  // --- get ---
  jobs
    .command('get <id>')
    .description('Get a job by ID')
    .action(async (id) => {
      const globalOpts = program.opts();
      try {
        const { api } = initApi(globalOpts);
        const job = await api.get(id);
        outputDetail(job, { format: globalOpts.output, headers: JOB_HEADERS });
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  // --- create ---
  jobs
    .command('create')
    .description('Create a job')
    .option('--customer <id>', 'Customer ID')
    .option('--description <text>', 'Job description')
    .option('--scheduled <datetime>', 'Scheduled start (YYYY-MM-DD HH:mm)')
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
        } else if (options.customer) {
          data = { customer_id: parseInt(options.customer, 10) };
          if (options.description) data.description = options.description;
          if (options.scheduled) data.scheduled_start = options.scheduled;
        } else {
          data = await inquirer.prompt([
            { type: 'input', name: 'customer_id', message: 'Customer ID:' },
            { type: 'input', name: 'description', message: 'Description:' },
            { type: 'input', name: 'job_type', message: 'Job type:' },
            { type: 'input', name: 'scheduled_start', message: 'Scheduled start (YYYY-MM-DD HH:mm):' },
          ]);
          for (const key of Object.keys(data)) {
            if (!data[key]) delete data[key];
          }
          if (data.customer_id) data.customer_id = parseInt(data.customer_id, 10);
        }

        if (globalOpts.dryRun) {
          console.log(chalk.yellow('Dry run — would create:'));
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        const result = await api.create(data);
        console.log(chalk.green(`Job created (ID: ${result.id ?? result.data?.id ?? 'unknown'}).`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  // --- update ---
  jobs
    .command('update <id>')
    .description('Update a job')
    .option('--set <field=value...>', 'Set field values', collect, [])
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
          console.log(chalk.yellow(`Dry run — would update job ${id}:`));
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        await api.update(id, data);
        console.log(chalk.green(`Job ${id} updated.`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  // --- status (quick status change) ---
  jobs
    .command('status <id> <newStatus>')
    .description('Change job status (e.g. Completed, Dispatched)')
    .action(async (id, newStatus) => {
      const globalOpts = program.opts();
      try {
        const { api } = initApi(globalOpts);
        if (globalOpts.dryRun) {
          console.log(chalk.yellow(`Dry run — would set job ${id} status to "${newStatus}"`));
          return;
        }
        await api.update(id, { status: newStatus });
        console.log(chalk.green(`Job ${id} status → ${newStatus}`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  // --- dispatch ---
  jobs
    .command('dispatch <id>')
    .description('Set job to Dispatched')
    .action(async (id) => {
      const globalOpts = program.opts();
      try {
        const { api } = initApi(globalOpts);
        if (globalOpts.dryRun) {
          console.log(chalk.yellow(`Dry run — would dispatch job ${id}`));
          return;
        }
        await api.update(id, { status: 'Dispatched' });
        console.log(chalk.green(`Job ${id} dispatched.`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  // --- assign ---
  jobs
    .command('assign <id>')
    .description('Assign technician to job')
    .requiredOption('--technician <techId>', 'Technician ID')
    .action(async (id, options) => {
      const globalOpts = program.opts();
      try {
        const { api } = initApi(globalOpts);
        if (globalOpts.dryRun) {
          console.log(chalk.yellow(`Dry run — would assign tech ${options.technician} to job ${id}`));
          return;
        }
        await api.update(id, { technician_ids: [parseInt(options.technician, 10)] });
        console.log(chalk.green(`Technician ${options.technician} assigned to job ${id}.`));
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
  const api = createJobsApi(client);
  return { client, api };
}

function collect(value, previous) {
  return previous.concat([value]);
}
