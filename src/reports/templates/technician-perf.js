import Table from 'cli-table3';
import chalk from 'chalk';
import dayjs from 'dayjs';
import { stringify } from 'csv-stringify/sync';
import { parsePeriod, currency } from '../engine.js';
import { fetchAll } from '../../utils/paginator.js';

const COMPLETED_STATUSES = new Set(['Completed', 'Invoiced', 'Closed', 'Paid In Full']);

export async function techPerformanceReport(client, { period, from, to, format = 'table' } = {}) {
  const range = from && to ? { from, to, label: `${from} — ${to}` } : parsePeriod(period);

  const [jobs, techs] = await Promise.all([
    fetchAll(client, '/jobs', { scheduled_after: range.from, scheduled_before: range.to }),
    fetchAll(client, '/technicians', {}),
  ]);

  const techMap = {};
  for (const t of techs) {
    techMap[t.id] = `${t.first_name || ''} ${t.last_name || ''}`.trim() || `Tech #${t.id}`;
  }

  const byTech = {};
  for (const job of jobs) {
    if (!COMPLETED_STATUSES.has(job.status)) continue;
    const techIds = job.technician_ids || (job.technician_id ? [job.technician_id] : []);
    const amount = parseFloat(job.total) || 0;

    // Calculate days to complete
    let days = null;
    if (job.scheduled_start && job.completed_at) {
      days = dayjs(job.completed_at).diff(dayjs(job.scheduled_start), 'day', true);
    }

    for (const tid of techIds) {
      if (!byTech[tid]) byTech[tid] = { jobs: 0, revenue: 0, totalDays: 0, daysCount: 0 };
      byTech[tid].jobs++;
      byTech[tid].revenue += amount;
      if (days !== null && days >= 0) {
        byTech[tid].totalDays += days;
        byTech[tid].daysCount++;
      }
    }
  }

  const sorted = Object.entries(byTech).sort((a, b) => b[1].revenue - a[1].revenue);

  if (format === 'json') {
    return JSON.stringify({
      period: range.label,
      technicians: sorted.map(([id, d]) => ({
        id, name: techMap[id] || `Tech #${id}`, ...d,
        avgPerJob: d.jobs > 0 ? Math.round(d.revenue / d.jobs) : 0,
        avgDays: d.daysCount > 0 ? (d.totalDays / d.daysCount).toFixed(1) : null,
      })),
    }, null, 2);
  }

  if (format === 'csv') {
    const rows = sorted.map(([id, d]) => [
      techMap[id] || `Tech #${id}`, d.jobs, d.revenue,
      d.jobs > 0 ? Math.round(d.revenue / d.jobs) : 0,
      d.daysCount > 0 ? (d.totalDays / d.daysCount).toFixed(1) : '',
    ]);
    return stringify([['Technician', 'Jobs', 'Revenue', 'Avg/Job', 'Avg Days'], ...rows]);
  }

  const table = new Table({
    head: ['Technician', 'Jobs', 'Revenue', 'Avg/Job', 'Avg Days'].map((h) => chalk.bold(h)),
    style: { head: [] },
  });

  for (const [id, d] of sorted) {
    const avgJob = d.jobs > 0 ? currency(Math.round(d.revenue / d.jobs)) : '-';
    const avgDays = d.daysCount > 0 ? (d.totalDays / d.daysCount).toFixed(1) : '-';
    table.push([techMap[id] || `Tech #${id}`, d.jobs, currency(d.revenue), avgJob, avgDays]);
  }

  let out = `\n${chalk.bold(`  TECHNICIAN PERFORMANCE — ${range.label}`)}\n\n`;
  out += table.toString() + '\n';
  return out;
}
