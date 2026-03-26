/**
 * Parse a --sort flag value into field and direction.
 * Format: "field" or "field:asc" or "field:desc"
 * @param {string} sortFlag
 * @returns {{ field: string, direction: 'asc' | 'desc' }}
 */
export function parseSortFlag(sortFlag) {
  const parts = sortFlag.split(':');
  const field = parts[0];
  const direction = parts[1]?.toLowerCase() === 'desc' ? 'desc' : 'asc';
  return { field, direction };
}

/**
 * Sort an array of row objects by a field.
 * Does not mutate the original array.
 * Nulls/undefined are pushed to the end regardless of direction.
 * @param {Object[]} rows
 * @param {{ field: string, direction: 'asc' | 'desc' }} sort
 * @returns {Object[]}
 */
export function sortRows(rows, { field, direction }) {
  // Check if any row has this field with a non-null value
  const hasField = rows.some(r => r[field] != null);
  if (!hasField) return rows;

  return [...rows].sort((a, b) => {
    const aVal = a[field];
    const bVal = b[field];

    // Nulls to end
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;

    let cmp;
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      cmp = aVal - bVal;
    } else {
      cmp = String(aVal).localeCompare(String(bVal), undefined, { sensitivity: 'base' });
    }

    return direction === 'desc' ? -cmp : cmp;
  });
}
