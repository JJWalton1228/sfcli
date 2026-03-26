import axios from 'axios';
import { getLogger } from './logger.js';

/**
 * Send a Slack notification via incoming webhook.
 * Silently skips if webhookUrl is not configured.
 * Never throws — logs errors instead.
 */
export async function sendSlackNotification(webhookUrl, text) {
  if (!webhookUrl) return;

  const logger = getLogger();
  try {
    await axios.post(webhookUrl, { text }, { timeout: 10000 });
  } catch (err) {
    logger.debug(`Slack notification failed: ${err.message}`);
  }
}

/**
 * Format a sync success summary for Slack.
 * @param {Object} stats - { entityName: { created, updated, errors } }
 * @param {number} durationSeconds
 */
export function formatSyncSuccess(stats, durationSeconds) {
  const lines = [`:white_check_mark: *Sync completed* (${durationSeconds}s)`];

  for (const [entity, counts] of Object.entries(stats)) {
    const parts = [];
    if (counts.created) parts.push(`${counts.created} created`);
    if (counts.updated) parts.push(`${counts.updated} updated`);
    if (counts.skipped) parts.push(`${counts.skipped} skipped`);
    if (counts.errors) parts.push(`${counts.errors} error${counts.errors > 1 ? 's' : ''}`);
    lines.push(`  • *${entity}*: ${parts.join(', ') || 'no changes'}`);
  }

  return lines.join('\n');
}

/**
 * Format a sync failure message for Slack.
 * @param {string} entity - Which entity failed
 * @param {Error} error
 */
export function formatSyncFailure(entity, error) {
  return `:x: *Sync failed* on *${entity}*\n  Error: ${error.message}`;
}
