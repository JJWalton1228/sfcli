import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getConfigDir } from '../config/index.js';
import { randomUUID } from 'crypto';

const CONFLICTS_FILE = 'sync-conflicts.json';

function getConflictsPath() {
  return join(getConfigDir(), CONFLICTS_FILE);
}

function readConflicts() {
  const path = getConflictsPath();
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return [];
  }
}

function writeConflicts(conflicts) {
  const dir = getConfigDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(getConflictsPath(), JSON.stringify(conflicts, null, 2));
}

/**
 * Record a sync conflict.
 */
export function addConflict({ entityType, sfId, fmRecordId, sfData, fmData }) {
  const conflicts = readConflicts();
  const conflict = {
    id: randomUUID().slice(0, 8),
    entity_type: entityType,
    sf_id: sfId,
    fm_record_id: fmRecordId,
    sf_data: sfData,
    fm_data: fmData,
    detected_at: new Date().toISOString(),
    resolved: false,
  };
  conflicts.push(conflict);
  writeConflicts(conflicts);
  return conflict;
}

/**
 * List unresolved conflicts.
 */
export function listConflicts({ entityType } = {}) {
  const conflicts = readConflicts();
  return conflicts.filter((c) => {
    if (c.resolved) return false;
    if (entityType && c.entity_type !== entityType) return false;
    return true;
  });
}

/**
 * Resolve a conflict.
 * @param {string} conflictId
 * @param {'sf'|'fm'} winner - Which side wins
 * @returns {{ conflict, winnerData }} The resolved conflict and data to apply
 */
export function resolveConflict(conflictId, winner) {
  const conflicts = readConflicts();
  const conflict = conflicts.find((c) => c.id === conflictId);
  if (!conflict) throw new Error(`Conflict not found: ${conflictId}`);
  if (conflict.resolved) throw new Error(`Conflict already resolved: ${conflictId}`);

  conflict.resolved = true;
  conflict.resolved_at = new Date().toISOString();
  conflict.resolution = winner;
  writeConflicts(conflicts);

  return {
    conflict,
    winnerData: winner === 'sf' ? conflict.sf_data : conflict.fm_data,
  };
}

/**
 * Apply a conflict resolution strategy automatically.
 * @param {'sf-wins'|'fm-wins'|'newest-wins'} strategy
 */
export function autoResolveStrategy(strategy, sfData, fmData) {
  switch (strategy) {
    case 'sf-wins':
      return 'sf';
    case 'fm-wins':
      return 'fm';
    case 'newest-wins': {
      const sfTime = sfData?.updated_at ? new Date(sfData.updated_at).getTime() : 0;
      const fmTime = fmData?.modificationTimestamp ? new Date(fmData.modificationTimestamp).getTime() : 0;
      return sfTime >= fmTime ? 'sf' : 'fm';
    }
    default:
      return null; // Manual resolution required
  }
}
