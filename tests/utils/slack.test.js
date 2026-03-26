import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { sendSlackNotification, formatSyncSuccess, formatSyncFailure } from '../../src/utils/slack.js';

const WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/xxx';

beforeEach(() => nock.cleanAll());
afterEach(() => nock.cleanAll());

describe('Slack — message formatting', () => {
  it('should format a sync success message with entity counts', () => {
    const stats = {
      customers: { created: 2, updated: 5, errors: 0 },
      jobs: { created: 0, updated: 12, errors: 1 },
    };
    const msg = formatSyncSuccess(stats, 45);

    expect(msg).toContain('Sync completed');
    expect(msg).toContain('customers');
    expect(msg).toContain('2 created');
    expect(msg).toContain('5 updated');
    expect(msg).toContain('jobs');
    expect(msg).toContain('1 error');
    expect(msg).toContain('45s');
  });

  it('should format a sync failure message with error details', () => {
    const msg = formatSyncFailure('jobs', new Error('FM connection timeout'));

    expect(msg).toContain('Sync failed');
    expect(msg).toContain('jobs');
    expect(msg).toContain('FM connection timeout');
  });
});

describe('Slack — sending notifications', () => {
  it('should POST to the webhook URL', async () => {
    const scope = nock('https://hooks.slack.com')
      .post('/services/T00/B00/xxx', (body) => {
        return body.text && body.text.includes('test message');
      })
      .reply(200, 'ok');

    await sendSlackNotification(WEBHOOK_URL, 'test message');
    expect(scope.isDone()).toBe(true);
  });

  it('should not throw when webhook URL is not configured', async () => {
    // Should silently skip when no URL
    await expect(sendSlackNotification(null, 'test')).resolves.not.toThrow();
    await expect(sendSlackNotification('', 'test')).resolves.not.toThrow();
  });

  it('should not throw on webhook failure (log only)', async () => {
    nock('https://hooks.slack.com')
      .post('/services/T00/B00/xxx')
      .reply(500, 'server error');

    await expect(sendSlackNotification(WEBHOOK_URL, 'test')).resolves.not.toThrow();
  });
});
