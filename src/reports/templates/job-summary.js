import Table from 'cli-table3';
import chalk from 'chalk';
import { stringify } from 'csv-stringify/sync';
import { parsePeriod, currency } from '../engine.js';
import { createJobsApi } from '../../api/jobs.js';
import { fetchAll } from '../../utils/paginator.js';

const STATUSES = ['Scheduled', 'Dispatched', 'In Progress', 'Completed', 'Invoiced', 'Closed', 'Paid In Full'];
const REVENUE_STATUSES = new Set(['Completed', 'Invoiced', 'Closed', 'Paid In Full']);

export async function jobSummaryReport(client, { period, from, to, format = 'table' } = {}) {
  const range = from && to ? { from, to, label: `${from} — ${to}` } : parsePeriod(period);

  const jobs = await fetchAll(client, '/jobs', {
    scheduled_after: range.from,
    scheduled_before: range.to,
  });

  // Aggregate by status
  const byStatus = {};
  for (const s of STATUSES) byStatus[s] = { count: 0, revenue: 0 };

  const byType = {};
  let totalCount = 0;
  let totalRevenue = 0;

  for (const job of jobs) {
    const status = job.status || 'Unknown';
    if (!byStatus[status]) byStatus[status] = { count: 0, revenue: 0 };
    byStatus[status].count++;
    totalCount++;

    const amount = parseFloat(job.total) || 0;
    if (REVENUE_STATUSES.has(status)) {
      byStatus[status].revenue += amount;
      totalRevenue += amount;
    }

    const type = job.job_type || 'Other';
    if (!byType[type]) byType[type] = { count: 0, revenue: 0 };
    byType[type].count++;
    if (REVENUE_STATUSES.has(status)) byType[type].revenue += amount;
  }

  if (format === 'json') {
    return JSON.stringify({ period: range.label, byStatus, byType, totalCount, totalRevenue }, null, 2);
  }

  if (format === 'csv') {
    const rows = STATUSES.filter((s) => byStatus[s].count > 0).map((s) => [s, byStatus[s].count, byStatus[s].revenue || '']);
    rows.push(['TOTAL', totalCount, totalRevenue]);
    return stringify([['Status', 'Count', 'Revenue'], ...rows]);
  }

  // Table format
  const table = new Table({
    head: [chalk.bold('Status'), chalk.bold('Count'), chalk.bold('Revenue')],
    style: { head: [] },
  });

  for (const s of STATUSES) {
    if (byStatus[s].count === 0) continue;
    table.push([s, byStatus[s].count, REVENUE_STATUSES.has(s) ? currency(byStatus[s].revenue) : '-']);
  }
  table.push([chalk.bold('TOTAL'), chalk.bold(totalCount), chalk.bold(currency(totalRevenue))]);

  let out = `\n${chalk.bold(`  JOB SUMMARY — ${range.label}`)}\n`;
  out += `  Period: ${range.from} — ${range.to}\n\n`;
  out += table.toString() + '\n';

  // Top job types
  const sortedTypes = Object.entries(byType).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
  if (sortedTypes.length > 0) {
    out += `\n  ${chalk.bold('Top Job Types:')}\n`;
    sortedTypes.forEach(([type, data], i) => {
      out += `  ${i + 1}. ${type} ${'·'.repeat(Math.max(1, 30 - type.length))} ${data.count} jobs (${currency(data.revenue)})\n`;
    });
  }

  return out;
}
