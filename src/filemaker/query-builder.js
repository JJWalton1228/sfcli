/**
 * Build a FileMaker find-query for push operations.
 *
 * Returns `null` when no filters apply (caller should fetch all records).
 * Otherwise returns a FileMaker find query array: `[{ field: operator+value, ... }]`.
 *
 * Filter rules:
 * - technicians:
 *     - If `fm_active_field` is set, include `{ [field]: "==<fm_active_value||'Active'>" }`.
 *     - Five-year window is NOT applied (per PRD: active techs regardless of date).
 * - If `createdSince` and `fm_created_field` are set, include
 *   `{ [fm_created_field]: ">=<createdSince>" }`.
 * - other entities (customers, jobs, estimates, invoices, equipment):
 *     - If `sinceDate` is set, include `{ [last_modified_field]: ">=<sinceDate>" }`.
 *     - Else if `fiveYearWindow` is set, include `{ [last_modified_field]: ">=<5-years-ago>" }`.
 *     - `sinceDate` always overrides `fiveYearWindow`.
 * - If the entity has no `fm_last_modified_field` and no other filters apply, returns null.
 */
export function buildFmPushQuery({ entityType, mapping, sinceDate, createdSince, fiveYearWindow, now = new Date() }) {
  const clause = {};

  if (createdSince && mapping.fm_created_field) {
    clause[mapping.fm_created_field] = `>=${createdSince}`;
  }

  if (entityType === 'technicians') {
    if (mapping.fm_active_field) {
      clause[mapping.fm_active_field] = `==${mapping.fm_active_value ?? 'Active'}`;
    }
    // Techs: only sinceDate applies if provided; no five-year window.
    if (sinceDate && mapping.fm_last_modified_field) {
      clause[mapping.fm_last_modified_field] = `>=${sinceDate}`;
    }
  } else {
    if (sinceDate && mapping.fm_last_modified_field) {
      clause[mapping.fm_last_modified_field] = `>=${sinceDate}`;
    } else if (fiveYearWindow && mapping.fm_last_modified_field) {
      clause[mapping.fm_last_modified_field] = `>=${fiveYearsAgoIso(now)}`;
    }
  }

  return Object.keys(clause).length === 0 ? null : [clause];
}

/**
 * Return an ISO string for exactly five years before the given anchor date.
 */
export function fiveYearsAgoIso(anchor = new Date()) {
  const d = new Date(anchor.getTime());
  d.setUTCFullYear(d.getUTCFullYear() - 5);
  return d.toISOString();
}
