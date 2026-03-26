import Table from 'cli-table3';
import chalk from 'chalk';
import { stringify } from 'csv-stringify/sync';
import { parseSortFlag, sortRows } from './sort.js';

/**
 * Format and print data based on the --output flag.
 * @param {Array<Object>} rows - Array of data objects
 * @param {Object} options
 * @param {string} options.format - table|json|csv|quiet
 * @param {string[]} options.columns - Column keys to display
 * @param {Object} [options.headers] - Map of key -> display header name
 * @param {string} [options.idField] - Field to use for quiet mode (default: 'id')
 */
export function output(rows, { format = 'table', columns, headers = {}, idField = 'id', sort } = {}) {
  if (!rows || rows.length === 0) {
    if (format === 'json') {
      console.log('[]');
    } else if (format === 'csv') {
      // empty
    } else if (format !== 'quiet') {
      console.log(chalk.yellow('No results found.'));
    }
    return;
  }

  // Apply sorting if --sort provided
  if (sort) {
    const sortSpec = parseSortFlag(sort);
    rows = sortRows(rows, sortSpec);
  }

  // Auto-detect columns from first row if not provided
  if (!columns) {
    columns = Object.keys(rows[0]);
  }

  switch (format) {
    case 'json':
      console.log(JSON.stringify(rows, null, 2));
      break;

    case 'csv': {
      const headerRow = columns.map((c) => headers[c] || c);
      const csvRows = rows.map((row) => columns.map((c) => row[c] ?? ''));
      const csvOutput = stringify([headerRow, ...csvRows]);
      process.stdout.write(csvOutput);
      break;
    }

    case 'quiet':
      for (const row of rows) {
        console.log(row[idField] ?? '');
      }
      break;

    case 'table':
    default: {
      const head = columns.map((c) => chalk.bold(headers[c] || c));
      const table = new Table({ head, style: { head: [] } });
      for (const row of rows) {
        table.push(columns.map((c) => row[c] ?? ''));
      }
      console.log(table.toString());
      break;
    }
  }
}

/**
 * Print a single record as key-value pairs.
 */
export function outputDetail(record, { format = 'table', headers = {} } = {}) {
  if (format === 'json') {
    console.log(JSON.stringify(record, null, 2));
    return;
  }

  if (format === 'csv') {
    output([record], { format, columns: Object.keys(record), headers });
    return;
  }

  const table = new Table({ style: { head: [] } });
  for (const [key, value] of Object.entries(record)) {
    table.push({ [chalk.bold(headers[key] || key)]: value ?? '' });
  }
  console.log(table.toString());
}
