import { describe, it, expect } from 'vitest';
import {
  buildCronEntries,
  parseCrontab,
  computeNextRun,
  isPacificTimezone,
  SFCLI_CRON_MARKER,
} from '../../src/utils/cron-scheduler.js';

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

  it('should include --since-last-sync so incremental pushes only send changed records', () => {
    const entries = buildCronEntries('/usr/local/bin/node /path/to/sfcli.js');
    for (const entry of entries) {
      expect(entry).toContain('--since-last-sync');
    }
  });
});

describe('computeNextRun', () => {
  it('returns 6am Pacific when called before 6am', () => {
    // 2026-04-06 05:00 UTC = 2026-04-05 22:00 Pacific (PDT, UTC-7)
    // Next 6am Pacific = 2026-04-06 06:00 PDT = 2026-04-06 13:00 UTC
    const now = new Date('2026-04-06T05:00:00.000Z');
    const next = computeNextRun(now);
    expect(next.hourPacific).toBe(6);
    expect(next.iso).toBe('2026-04-06T13:00:00.000Z');
  });

  it('returns 6pm Pacific when called between 6am and 6pm Pacific', () => {
    // 2026-04-06 15:00 UTC = 2026-04-06 08:00 PDT (after 6am)
    // Next run = 2026-04-06 18:00 PDT = 2026-04-07 01:00 UTC
    const now = new Date('2026-04-06T15:00:00.000Z');
    const next = computeNextRun(now);
    expect(next.hourPacific).toBe(18);
    expect(next.iso).toBe('2026-04-07T01:00:00.000Z');
  });

  it('rolls to next day 6am when called after 6pm Pacific', () => {
    // 2026-04-06 23:00 UTC = 2026-04-06 16:00 PDT... wait that's before 18.
    // Use 2026-04-07 02:00 UTC = 2026-04-06 19:00 PDT (after 6pm)
    // Next run = 2026-04-07 06:00 PDT = 2026-04-07 13:00 UTC
    const now = new Date('2026-04-07T02:00:00.000Z');
    const next = computeNextRun(now);
    expect(next.hourPacific).toBe(6);
    expect(next.iso).toBe('2026-04-07T13:00:00.000Z');
  });
});

describe('isPacificTimezone', () => {
  it('accepts America/Los_Angeles', () => {
    expect(isPacificTimezone('America/Los_Angeles')).toBe(true);
  });

  it('accepts PST/PDT aliases', () => {
    expect(isPacificTimezone('US/Pacific')).toBe(true);
  });

  it('rejects unrelated timezones', () => {
    expect(isPacificTimezone('America/New_York')).toBe(false);
    expect(isPacificTimezone('UTC')).toBe(false);
    expect(isPacificTimezone(undefined)).toBe(false);
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
