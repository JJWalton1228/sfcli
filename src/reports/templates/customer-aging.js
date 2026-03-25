import Table from 'cli-table3';
import chalk from 'chalk';
import dayjs from 'dayjs';
import { stringify } from 'csv-stringify/sync';
import { fetchAll } from '../../utils/paginator.js';

const COMPLETED_STATUSES = new Set(['Completed', 'Invoiced', 'Closed', 'Paid In Full']);

const BUCKETS = [
  { label: 'Active', max: 30, color: 'green' },
  { label: 'At Risk', max: 90, color: 'yellow' },
  { label: 'Inactive', max: 180, color: 'red' },
  { label: 'Lost', max: Infinity, color: 'gray' },
];

export async function customerAgingReport(client, { format = 'table' } = {}) {
  const [customers, jobs] = await Promise.all([
    fetchAll(client, '/customers', {}),
    fetchAll(client, '/jobs', {}),
  ]);

  // Find last completed job per customer
  const lastService = {};
  for (const job of jobs) {
    if (!COMPLETED_STATUSES.has(job.status)) continue;
    const custId = job.customer_id;
    const date = job.completed_at || job.scheduled_end || job.scheduled_start;
    if (!date) continue;
    if (!lastService[custId] || dayjs(date).isAfter(dayjs(lastService[custId]))) {
      lastService[custId] = date;
    }
  }

  const now = dayjs();
  const rows = customers.map((c) => {
    const lastDate = lastService[c.id];
    const daysSince = lastDate ? now.diff(dayjs(lastDate), 'day') : null;
    const bucket = daysSince !== null
      ? BUCKETS.find((b) => daysSince <= b.max)
      : { label: 'Never Serviced', color: 'gray' };
    return {
      id: c.id,
      name: c.customer_name || `${c.contact_first_name || ''} ${c.contact_last_name || ''}`.trim(),
      last_service: lastDate ? dayjs(lastDate).format('YYYY-MM-DD') : 'Never',
      days_since: daysSince ?? 'N/A',
      bucket: bucket.label,
      bucketColor: bucket.color,
    };
  }).sort((a, b) => {
    if (a.days_since === 'N/A') return 1;
    if (b.days_since === 'N/A') return -1;
    return b.days_since - a.days_since;
  });

  // Summary counts
  const summary = {};
  for (const r of rows) {
    summary[r.bucket] = (summary[r.bucket] || 0) + 1;
  }

  if (format === 'json') {
    return JSON.stringify({ summary, customers: rows.map(({ bucketColor, ...r }) => r) }, null, 2);
  }

  if (format === 'csv') {
    const csvRows = rows.map((r) => [r.id, r.name, r.last_service, r.days_since, r.bucket]);
    return stringify([['ID', 'Customer', 'Last Service', 'Days Since', 'Status'], ...csvRows]);
  }

  // Summary table
  const summaryTable = new Table({
    head: [chalk.bold('Status'), chalk.bold('Count')],
    style: { head: [] },
  });
  for (const b of [...BUCKETS, { label: 'Never Serviced' }]) {
    if (summary[b.label]) summaryTable.push([b.label, summary[b.label]]);
  }

  // Detail table (top 30)
  const detailTable = new Table({
    head: ['ID', 'Customer', 'Last Service', 'Days', 'Status'].map((h) => chalk.bold(h)),
    style: { head: [] },
  });
  for (const r of rows.slice(0, 30)) {
    const colorFn = chalk[r.bucketColor] || chalk.white;
    detailTable.push([r.id, r.name, r.last_service, r.days_since, colorFn(r.bucket)]);
  }

  let out = `\n${chalk.bold('  CUSTOMER AGING REPORT')}\n\n`;
  out += summaryTable.toString() + '\n\n';
  out += detailTable.toString() + '\n';
  if (rows.length > 30) out += chalk.dim(`  ... and ${rows.length - 30} more customers\n`);
  return out;
}

export async function customerActivityReport(client, { inactiveDays = 90, format = 'table' } = {}) {
  const report = await customerAgingReport(client, { format: 'json' });
  const data = JSON.parse(report);
  const inactive = data.customers.filter((c) => c.days_since !== 'N/A' && c.days_since >= inactiveDays);

  if (format === 'json') return JSON.stringify(inactive, null, 2);
  if (format === 'csv') {
    const csvRows = inactive.map((c) => [c.id, c.name, c.last_service, c.days_since, c.bucket]);
    return stringify([['ID', 'Customer', 'Last Service', 'Days Since', 'Status'], ...csvRows]);
  }

  const table = new Table({
    head: ['ID', 'Customer', 'Last Service', 'Days', 'Status'].map((h) => chalk.bold(h)),
    style: { head: [] },
  });
  for (const c of inactive) {
    table.push([c.id, c.name, c.last_service, c.days_since, c.bucket]);
  }

  let out = `\n${chalk.bold(`  INACTIVE CUSTOMERS (${inactiveDays}+ days)`)}\n`;
  out += `  Found: ${inactive.length} customers\n\n`;
  out += table.toString() + '\n';
  return out;
}
