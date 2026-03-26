import { describe, it, expect } from 'vitest';
import { buildCronEntries, parseCrontab, SFCLI_CRON_MARKER } from '../../src/utils/cron-scheduler.js';

describe('Cron scheduler — build entries', () => {
  it('should generate two cron entries for 6am and 6pm Pacific', () => {
    const entries = buildCronEntries('/usr/local/bin/node /Users/test/sfcli/bin/sfcli.js');
    expect(entries).toHaveLength(2);
    // 6am Pacific
    expect(entries[0]).toContain('0 6 * * *');
    // 6pm Pacific
    expect(entries[1]).toContain('0 18 * * *');
    // Both should contain the sfcli command
    expect(entries[0]).toContain('sfcli.js');
    expect(entries[1]).toContain('sfcli.js');
    // Both should have the marker comment
    expect(entries[0]).toContain(SFCLI_CRON_MARKER);
    expect(entries[1]).toContain(SFCLI_CRON_MARKER);
  });

  it('should include sync push command with --notify flag', () => {
    const entries = buildCronEntries('/usr/local/bin/node /path/to/sfcli.js');
    for (const entry of entries) {
      expect(entry).toContain('sync push all');
      expect(entry).toContain('--notify');
    }
  });
});

describe('Cron scheduler — parse crontab', () => {
  it('should detect sfcli entries in existing crontab', () => {
    const crontab = [
      '# some other cron',
      '0 * * * * /usr/bin/something',
      `0 6 * * * /usr/local/bin/node /path/sfcli.js sync push all --notify # ${SFCLI_CRON_MARKER}`,
      `0 18 * * * /usr/local/bin/node /path/sfcli.js sync push all --notify # ${SFCLI_CRON_MARKER}`,
    ].join('\n');

    const result = parseCrontab(crontab);
    expect(result.hasSfcli).toBe(true);
    expect(result.sfcliEntries).toHaveLength(2);
    expect(result.otherEntries).toHaveLength(2);
  });

  it('should report no sfcli entries in empty crontab', () => {
    const result = parseCrontab('');
    expect(result.hasSfcli).toBe(false);
    expect(result.sfcliEntries).toHaveLength(0);
  });

  it('should strip sfcli entries and preserve others', () => {
    const crontab = [
      '0 * * * * /usr/bin/something',
      `0 6 * * * /path/sfcli.js sync push all # ${SFCLI_CRON_MARKER}`,
    ].join('\n');

    const result = parseCrontab(crontab);
    expect(result.otherEntries).toHaveLength(1);
    expect(result.otherEntries[0]).toContain('/usr/bin/something');
  });
});
