import { execSync } from 'child_process';
import { getLogger } from './logger.js';

export const SFCLI_CRON_MARKER = 'SFCLI_SYNC';

/**
 * Build two crontab entries for 6am and 6pm Pacific.
 * @param {string} sfcliCommand - Full path to node + sfcli.js
 * @returns {string[]} Two cron entry strings
 */
export function buildCronEntries(sfcliCommand) {
  const syncCmd = `${sfcliCommand} sync push all --created-since 2024-10-01 --since-last-sync --notify`;
  return [
    `0 6 * * * TZ=America/Los_Angeles ${syncCmd} # ${SFCLI_CRON_MARKER}`,
    `0 18 * * * TZ=America/Los_Angeles ${syncCmd} # ${SFCLI_CRON_MARKER}`,
  ];
}

/**
 * Compute the next scheduled run (6am or 6pm Pacific) from a reference Date.
 * Handles PST (UTC-8) and PDT (UTC-7) via Intl.DateTimeFormat.
 *
 * @param {Date} now - reference instant
 * @returns {{ iso: string, hourPacific: 6|18 }}
 */
export function computeNextRun(now = new Date()) {
  // Determine the current hour in Pacific time using Intl — handles DST automatically.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type) => Number(parts.find(p => p.type === type).value);
  const pacHour = get('hour') % 24;
  const pacMinute = get('minute');
  const pacSecond = get('second');
  const pacYear = get('year');
  const pacMonth = get('month');
  const pacDay = get('day');

  // Pick next slot: 6am, 6pm, or tomorrow 6am.
  let targetHour, targetYear = pacYear, targetMonth = pacMonth, targetDay = pacDay;
  const beforeSix = pacHour < 6 || (pacHour === 6 && pacMinute === 0 && pacSecond === 0);
  const beforeEighteen = pacHour < 18 || (pacHour === 18 && pacMinute === 0 && pacSecond === 0);
  if (beforeSix) {
    targetHour = 6;
  } else if (beforeEighteen) {
    targetHour = 18;
  } else {
    targetHour = 6;
    // Roll to next calendar day in Pacific.
    const tomorrow = new Date(Date.UTC(pacYear, pacMonth - 1, pacDay));
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    targetYear = tomorrow.getUTCFullYear();
    targetMonth = tomorrow.getUTCMonth() + 1;
    targetDay = tomorrow.getUTCDate();
  }

  // Convert (pacYear/pacMonth/pacDay targetHour:00 Pacific) → UTC.
  // Strategy: binary-search the offset by probing Intl. Simpler: compute offset from current instant.
  // The offset (UTC - Pacific) at `now` is stable enough for the next 12h window.
  const offsetMinutes = computePacificOffsetMinutes(now);
  const iso = new Date(Date.UTC(targetYear, targetMonth - 1, targetDay, targetHour, 0, 0) + offsetMinutes * 60_000).toISOString();

  return { iso, hourPacific: targetHour };
}

/**
 * Return the current Pacific UTC offset in minutes (positive = Pacific is behind UTC).
 * e.g. PDT = 420 (UTC-7), PST = 480 (UTC-8).
 */
function computePacificOffsetMinutes(now) {
  const utcParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', hour: '2-digit', hour12: false,
  }).formatToParts(now);
  const pacParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', hour: '2-digit', hour12: false,
  }).formatToParts(now);
  const utcHour = Number(utcParts.find(p => p.type === 'hour').value) % 24;
  const pacHour = Number(pacParts.find(p => p.type === 'hour').value) % 24;
  let diff = utcHour - pacHour;
  if (diff < 0) diff += 24;
  return diff * 60;
}

/**
 * Check whether a timezone string is considered Pacific-compatible.
 */
export function isPacificTimezone(tz) {
  if (!tz) return false;
  return ['America/Los_Angeles', 'US/Pacific', 'PST8PDT'].includes(tz);
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
