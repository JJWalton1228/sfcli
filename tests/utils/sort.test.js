import { describe, it, expect } from 'vitest';
import { sortRows, parseSortFlag } from '../../src/utils/sort.js';

describe('parseSortFlag', () => {
  it('parses field name alone as ascending', () => {
    expect(parseSortFlag('customer_name')).toEqual({ field: 'customer_name', direction: 'asc' });
  });

  it('parses field:asc', () => {
    expect(parseSortFlag('id:asc')).toEqual({ field: 'id', direction: 'asc' });
  });

  it('parses field:desc', () => {
    expect(parseSortFlag('total:desc')).toEqual({ field: 'total', direction: 'desc' });
  });

  it('is case-insensitive for direction', () => {
    expect(parseSortFlag('name:DESC')).toEqual({ field: 'name', direction: 'desc' });
  });
});

describe('sortRows', () => {
  const rows = [
    { id: 3, name: 'Charlie', total: 100 },
    { id: 1, name: 'Alice', total: 300 },
    { id: 2, name: 'Bob', total: 200 },
  ];

  it('sorts strings ascending by default', () => {
    const sorted = sortRows(rows, { field: 'name', direction: 'asc' });
    expect(sorted.map(r => r.name)).toEqual(['Alice', 'Bob', 'Charlie']);
  });

  it('sorts strings descending', () => {
    const sorted = sortRows(rows, { field: 'name', direction: 'desc' });
    expect(sorted.map(r => r.name)).toEqual(['Charlie', 'Bob', 'Alice']);
  });

  it('sorts numbers ascending', () => {
    const sorted = sortRows(rows, { field: 'id', direction: 'asc' });
    expect(sorted.map(r => r.id)).toEqual([1, 2, 3]);
  });

  it('sorts numbers descending', () => {
    const sorted = sortRows(rows, { field: 'total', direction: 'desc' });
    expect(sorted.map(r => r.total)).toEqual([300, 200, 100]);
  });

  it('handles null/undefined values (pushed to end)', () => {
    const withNulls = [
      { id: 1, name: null },
      { id: 2, name: 'Bob' },
      { id: 3, name: undefined },
      { id: 4, name: 'Alice' },
    ];
    const sorted = sortRows(withNulls, { field: 'name', direction: 'asc' });
    expect(sorted.map(r => r.name)).toEqual(['Alice', 'Bob', null, undefined]);
  });

  it('does case-insensitive string comparison', () => {
    const mixed = [
      { name: 'banana' },
      { name: 'Apple' },
      { name: 'cherry' },
    ];
    const sorted = sortRows(mixed, { field: 'name', direction: 'asc' });
    expect(sorted.map(r => r.name)).toEqual(['Apple', 'banana', 'cherry']);
  });

  it('does not mutate the original array', () => {
    const original = [...rows];
    sortRows(rows, { field: 'id', direction: 'asc' });
    expect(rows).toEqual(original);
  });

  it('returns the array unchanged if field does not exist', () => {
    const sorted = sortRows(rows, { field: 'nonexistent', direction: 'asc' });
    expect(sorted).toEqual(rows);
  });
});
