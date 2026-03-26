import { execSync } from 'child_process';
import { getLogger } from './logger.js';

export const SFCLI_CRON_MARKER = 'SFCLI_SYNC';

/**
 * Build two crontab entries for 6am and 6pm Pacific.
 * @param {string} sfcliCommand - Full path to node + sfcli.js
 * @returns {string[]} Two cron entry strings
 */
export function buildCronEntries(sfcliCommand) {
  const syncCmd = `${sfcliCommand} sync push all --notify`;
  return [
    `0 6 * * * TZ=America/Los_Angeles ${syncCmd} # ${SFCLI_CRON_MARKER}`,
    `0 18 * * * TZ=America/Los_Angeles ${syncCmd} # ${SFCLI_CRON_MARKER}`,
  ];
}

/**
 * Parse a crontab string, separating sfcli entries from others.
 * @param {string} crontabText
 */
export function parseCrontab(crontabText) {
  const lines = crontabText.split('\n').filter(l => l.trim().length > 0);
  const sfcliEntries = [];
  const otherEntries = [];

  for (const line of lines) {
    if (line.includes(SFCLI_CRON_MARKER)) {
      sfcliEntries.push(line);
    } else {
      otherEntries.push(line);
    }
  }

  return {
    hasSfcli: sfcliEntries.length > 0,
    sfcliEntries,
    otherEntries,
  };
}

/**
 * Read current user crontab.
 */
export function readCrontab() {
  try {
    return execSync('crontab -l 2>/dev/null', { encoding: 'utf8' });
  } catch {
    return '';
  }
}

/**
 * Write a new crontab.
 */
export function writeCrontab(content) {
  execSync(`echo "${content.replace(/"/g, '\\"')}" | crontab -`, { encoding: 'utf8' });
}

/**
 * Enable the sfcli sync cron schedule.
 * @param {string} sfcliCommand - Full command to invoke sfcli
 */
export function enableSchedule(sfcliCommand) {
  const logger = getLogger();
  const current = readCrontab();
  const parsed = parseCrontab(current);

  if (parsed.hasSfcli) {
    logger.debug('sfcli cron entries already exist, replacing...');
  }

  const newEntries = buildCronEntries(sfcliCommand);
  const allEntries = [...parsed.otherEntries, ...newEntries];
  writeCrontab(allEntries.join('\n'));

  return newEntries;
}

/**
 * Disable the sfcli sync cron schedule.
 */
export function disableSchedule() {
  const current = readCrontab();
  const parsed = parseCrontab(current);

  if (!parsed.hasSfcli) return false;

  writeCrontab(parsed.otherEntries.join('\n'));
  return true;
}

/**
 * Get current schedule status.
 */
export function getScheduleStatus() {
  const current = readCrontab();
  const parsed = parseCrontab(current);
  return {
    enabled: parsed.hasSfcli,
    entries: parsed.sfcliEntries,
  };
}
