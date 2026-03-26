import Table from 'cli-table3';
import chalk from 'chalk';
import dayjs from 'dayjs';
import { stringify } from 'csv-stringify/sync';
import { parsePeriod, currency } from '../engine.js';
import { fetchAll } from '../../utils/paginator.js';

const REVENUE_STATUSES = new Set(['Completed', 'Invoiced', 'Closed', 'Paid In Full']);

export async function revenueReport(client, { period, from, to, format = 'table' } = {}) {
  const range = from && to ? { from, to, label: `${from} — ${to}` } : parsePeriod(period);

  const jobs = await fetchAll(client, '/jobs', {
    scheduled_after: range.from,
    scheduled_before: range.to,
  });

  // Monthly breakdown
  const byMonth = {};
  const byCustomer = {};
  let total = 0;

  for (const job of jobs) {
    if (!REVENUE_STATUSES.has(job.status)) continue;
    const amount = parseFloat(job.total) || 0;
    total += amount;

    const month = dayjs(job.scheduled_start || job.created_at).format('YYYY-MM');
    byMonth[month] = (byMonth[month] || 0) + amount;

    const custId = job.customer_id || 'Unknown';
    if (!byCustomer[custId]) byCustomer[custId] = 0;
    byCustomer[custId] += amount;
  }

  const months = Object.keys(byMonth).sort();
  const avgMonthly = months.length > 0 ? total / months.length : 0;

  if (format === 'json') {
    return JSON.stringify({ period: range.label, byMonth, byCustomer, total, avgMonthly }, null, 2);
  }

  if (format === 'csv') {
    const rows = months.map((m) => [m, byMonth[m]]);
    rows.push(['TOTAL', total]);
    rows.push(['AVG/MONTH', Math.round(avgMonthly)]);
    return stringify([['Month', 'Revenue'], ...rows]);
  }

  // Table
  const table = new Table({
    head: [chalk.bold('Month'), chalk.bold('Revenue')],
    style: { head: [] },
  });
  for (const m of months) {
    table.push([dayjs(m + '-01').format('MMM YYYY'), currency(byMonth[m])]);
  }
  table.push([chalk.bold('TOTAL'), chalk.bold(currency(total))]);
  table.push([chalk.dim('Avg/Month'), chalk.dim(currency(avgMonthly))]);

  let out = `\n${chalk.bold(`  REVENUE REPORT — ${range.label}`)}\n\n`;
  out += table.toString() + '\n';

  // Top customers by revenue
  const topCustomers = Object.entries(byCustomer).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (topCustomers.length > 0) {
    out += `\n  ${chalk.bold('Top Customers by Revenue:')}\n`;
    topCustomers.forEach(([custId, rev], i) => {
      const pct = total > 0 ? ((rev / total) * 100).toFixed(1) : '0.0';
      out += `  ${i + 1}. Customer #${custId} ${'·'.repeat(Math.max(1, 20 - String(custId).length))} ${currency(rev)} (${pct}%)\n`;
    });
  }

  return out;
}

export async function revenueByCustomerReport(client, { period, from, to, top = 20, format = 'table' } = {}) {
  const range = from && to ? { from, to, label: `${from} — ${to}` } : parsePeriod(period);

  const jobs = await fetchAll(client, '/jobs', {
    scheduled_after: range.from,
    scheduled_before: range.to,
  });

  const byCustomer = {};
  let total = 0;

  for (const job of jobs) {
    if (!REVENUE_STATUSES.has(job.status)) continue;
    const amount = parseFloat(job.total) || 0;
    total += amount;
    const custId = job.customer_id || 'Unknown';
    if (!byCustomer[custId]) byCustomer[custId] = { revenue: 0, jobs: 0 };
    byCustomer[custId].revenue += amount;
    byCustomer[custId].jobs++;
  }

  const sorted = Object.entries(byCustomer).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, top);

  if (format === 'json') {
    return JSON.stringify({ period: range.label, customers: sorted.map(([id, d]) => ({ customer_id: id, ...d })), total }, null, 2);
  }

  if (format === 'csv') {
    const rows = sorted.map(([id, d]) => [id, d.jobs, d.revenue, total > 0 ? ((d.revenue / total) * 100).toFixed(1) + '%' : '0%']);
    return stringify([['Customer ID', 'Jobs', 'Revenue', '% of Total'], ...rows]);
  }

  const table = new Table({
    head: [chalk.bold('Customer'), chalk.bold('Jobs'), chalk.bold('Revenue'), chalk.bold('% of Total')],
    style: { head: [] },
  });
  for (const [id, d] of sorted) {
    const pct = total > 0 ? ((d.revenue / total) * 100).toFixed(1) + '%' : '-';
    table.push([`#${id}`, d.jobs, currency(d.revenue), pct]);
  }

  let out = `\n${chalk.bold(`  REVENUE BY CUSTOMER — ${range.label}`)}\n`;
  out += `  Total: ${currency(total)}\n\n`;
  out += table.toString() + '\n';
  return out;
}
