import { describe, it, expect } from 'vitest';
import { buildFmPushQuery, fiveYearsAgoIso } from '../../src/filemaker/query-builder.js';

describe('buildFmPushQuery', () => {
  const customersMapping = {
    fm_layout: 'API_Customers',
    fm_last_modified_field: 'ModifiedTS',
  };

  const techsMapping = {
    fm_layout: 'API_Technicians',
    fm_last_modified_field: 'ModifiedTS',
    fm_active_field: 'Status',
    fm_active_value: 'Active',
  };

  it('returns null when no filters apply (fetch all)', () => {
    const q = buildFmPushQuery({ entityType: 'customers', mapping: {} });
    expect(q).toBeNull();
  });

  it('builds a since-date query using fm_last_modified_field', () => {
    const q = buildFmPushQuery({
      entityType: 'customers',
      mapping: customersMapping,
      sinceDate: '2026-03-01T00:00:00.000Z',
    });
    expect(q).toEqual([{ ModifiedTS: '>=2026-03-01T00:00:00.000Z' }]);
  });

  it('applies a 5-year rolling window for customers when requested', () => {
    const q = buildFmPushQuery({
      entityType: 'customers',
      mapping: customersMapping,
      fiveYearWindow: true,
    });
    expect(q).not.toBeNull();
    expect(q).toHaveLength(1);
    const range = q[0].ModifiedTS;
    // Should be >= some ISO date; verify format
    expect(range).toMatch(/^>=\d{4}-\d{2}-\d{2}/);
  });

  it('sinceDate overrides the five-year window when both are passed', () => {
    const q = buildFmPushQuery({
      entityType: 'customers',
      mapping: customersMapping,
      sinceDate: '2026-04-01T00:00:00.000Z',
      fiveYearWindow: true,
    });
    expect(q).toEqual([{ ModifiedTS: '>=2026-04-01T00:00:00.000Z' }]);
  });

  it('adds active-only filter for technicians regardless of date window', () => {
    const q = buildFmPushQuery({
      entityType: 'technicians',
      mapping: techsMapping,
    });
    expect(q).toEqual([{ Status: '==Active' }]);
  });

  it('combines since-date and active-only for technicians', () => {
    const q = buildFmPushQuery({
      entityType: 'technicians',
      mapping: techsMapping,
      sinceDate: '2026-03-01T00:00:00.000Z',
    });
    expect(q).toEqual([{
      Status: '==Active',
      ModifiedTS: '>=2026-03-01T00:00:00.000Z',
    }]);
  });

  it('does NOT apply the 5-year window to technicians', () => {
    const q = buildFmPushQuery({
      entityType: 'technicians',
      mapping: techsMapping,
      fiveYearWindow: true,
    });
    // No date filter — only active filter
    expect(q).toEqual([{ Status: '==Active' }]);
  });
});

describe('fiveYearsAgoIso', () => {
  it('returns an ISO date string five years before the given anchor', () => {
    const result = fiveYearsAgoIso(new Date('2026-04-06T00:00:00.000Z'));
    expect(result).toBe('2021-04-06T00:00:00.000Z');
  });
});
