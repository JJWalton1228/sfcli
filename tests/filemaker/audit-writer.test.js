import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { writeDryRunAudit } from '../../src/filemaker/audit-writer.js';

describe('writeDryRunAudit', () => {
  let dir;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('writes JSON and CSV detail files for dry-run audit rows', () => {
    dir = mkdtempSync(join(tmpdir(), 'sfcli-audit-'));

    const result = writeDryRunAudit({
      dir,
      entityType: 'customers',
      rows: [
        { action: 'create', source_key: 'Acme Corp', reason: '', sf_id: '' },
        { action: 'skip', source_key: 'Beta Inc', reason: 'duplicate', sf_id: '' },
      ],
      now: new Date('2026-05-09T12:00:00.000Z'),
    });

    expect(existsSync(result.jsonPath)).toBe(true);
    expect(existsSync(result.csvPath)).toBe(true);
    expect(JSON.parse(readFileSync(result.jsonPath, 'utf8'))).toHaveLength(2);
    const csv = readFileSync(result.csvPath, 'utf8');
    expect(csv).toContain('action,source_key,reason,sf_id');
    expect(csv).toContain('create,Acme Corp,,');
  });
});
