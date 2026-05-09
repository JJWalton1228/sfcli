import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { stringify } from 'csv-stringify/sync';

/**
 * Write dry-run audit detail files for operator review.
 */
export function writeDryRunAudit({ dir, entityType, rows, now = new Date() }) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const base = `${stamp}-${entityType}`;
  const jsonPath = join(dir, `${base}.json`);
  const csvPath = join(dir, `${base}.csv`);
  const safeRows = rows || [];

  writeFileSync(jsonPath, JSON.stringify(safeRows, null, 2));
  writeFileSync(csvPath, stringify(safeRows, {
    header: true,
    columns: collectColumns(safeRows),
  }));

  return { jsonPath, csvPath };
}

function collectColumns(rows) {
  const columns = new Set(['action', 'source_key', 'reason', 'sf_id']);
  for (const row of rows) {
    for (const key of Object.keys(row)) columns.add(key);
  }
  return [...columns];
}
