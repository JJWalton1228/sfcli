import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear.js';
import isoWeek from 'dayjs/plugin/isoWeek.js';
import { writeFileSync } from 'fs';
import chalk from 'chalk';

dayjs.extend(quarterOfYear);
dayjs.extend(isoWeek);

/**
 * Parse a --period flag into { from, to } date strings.
 * Supports: this-week, this-month, this-quarter, this-year, YYYY-QN, YYYY-MM-DD..YYYY-MM-DD
 */
export function parsePeriod(period) {
  if (!period) {
    // Default: this month
    return {
      from: dayjs().startOf('month').format('YYYY-MM-DD'),
      to: dayjs().endOf('month').format('YYYY-MM-DD'),
      label: dayjs().format('MMMM YYYY'),
    };
  }

  if (period.includes('..')) {
    const [from, to] = period.split('..');
    return { from, to, label: `${from} — ${to}` };
  }

  // YYYY-QN format (e.g. 2025-Q1)
  const qMatch = period.match(/^(\d{4})-Q(\d)$/i);
  if (qMatch) {
    const year = parseInt(qMatch[1], 10);
    const q = parseInt(qMatch[2], 10);
    const start = dayjs().year(year).quarter(q).startOf('quarter');
    const end = start.endOf('quarter');
    return { from: start.format('YYYY-MM-DD'), to: end.format('YYYY-MM-DD'), label: `Q${q} ${year}` };
  }

  const now = dayjs();
  switch (period) {
    case 'this-week':
      return { from: now.startOf('isoWeek').format('YYYY-MM-DD'), to: now.endOf('isoWeek').format('YYYY-MM-DD'), label: `Week of ${now.startOf('isoWeek').format('MMM D, YYYY')}` };
    case 'this-month':
      return { from: now.startOf('month').format('YYYY-MM-DD'), to: now.endOf('month').format('YYYY-MM-DD'), label: now.format('MMMM YYYY') };
    case 'this-quarter':
      return { from: now.startOf('quarter').format('YYYY-MM-DD'), to: now.endOf('quarter').format('YYYY-MM-DD'), label: `Q${now.quarter()} ${now.year()}` };
    case 'this-year':
      return { from: now.startOf('year').format('YYYY-MM-DD'), to: now.endOf('year').format('YYYY-MM-DD'), label: `${now.year()}` };
    default:
      throw new Error(`Unknown period format: "${period}". Use this-week, this-month, this-quarter, this-year, YYYY-QN, or YYYY-MM-DD..YYYY-MM-DD`);
  }
}

/**
 * Format a number as currency.
 */
export function currency(value) {
  if (value == null || isNaN(value)) return '-';
  return '$' + Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/**
 * Write report output to file or stdout.
 */
export function outputReport(content, { format = 'table', outputFile } = {}) {
  if (outputFile) {
    writeFileSync(outputFile, content, 'utf8');
    console.log(chalk.green(`Report written to ${outputFile}`));
  } else {
    console.log(content);
  }
}
