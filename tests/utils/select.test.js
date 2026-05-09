import { describe, it, expect, vi } from 'vitest';
import { output } from '../../src/utils/output.js';

describe('--select support in output', () => {
  it('uses select to override default columns', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const rows = [
        { id: 1, customer_name: 'Acme', phone: '555-1234', city: 'Austin', state: 'TX' },
      ];

      // Output as JSON to easily inspect which fields are included
      output(rows, {
        format: 'json',
        columns: ['id', 'customer_name', 'phone', 'city', 'state'],
        select: 'customer_name,city',
      });

      const printed = JSON.parse(spy.mock.calls[0][0]);
      expect(printed).toHaveLength(1);
      // Only selected fields should be in each row
      expect(Object.keys(printed[0]).sort()).toEqual(['city', 'customer_name']);
    } finally {
      spy.mockRestore();
    }
  });

  it('preserves all fields in JSON when select is not provided', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const rows = [
        { id: 1, customer_name: 'Acme', phone: '555-1234' },
      ];

      output(rows, {
        format: 'json',
        columns: ['id', 'customer_name'],
      });

      const printed = JSON.parse(spy.mock.calls[0][0]);
      // Without --select, JSON outputs the full row
      expect(Object.keys(printed[0])).toContain('id');
      expect(Object.keys(printed[0])).toContain('customer_name');
      expect(Object.keys(printed[0])).toContain('phone');
    } finally {
      spy.mockRestore();
    }
  });

  it('works with table format', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const rows = [
        { id: 1, customer_name: 'Acme', phone: '555-1234', city: 'Austin' },
      ];

      output(rows, {
        format: 'table',
        columns: ['id', 'customer_name', 'phone', 'city'],
        select: 'customer_name,city',
        headers: { customer_name: 'Name', city: 'City' },
      });

      const table = spy.mock.calls[0][0];
      expect(table).toContain('Acme');
      expect(table).toContain('Austin');
      // Should NOT contain phone since it wasn't selected
      expect(table).not.toContain('555-1234');
    } finally {
      spy.mockRestore();
    }
  });

  it('works with csv format', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => {});
    try {
      const rows = [
        { id: 1, customer_name: 'Acme', phone: '555-1234' },
      ];

      output(rows, {
        format: 'csv',
        columns: ['id', 'customer_name', 'phone'],
        select: 'customer_name',
        headers: { customer_name: 'Name' },
      });

      const csv = spy.mock.calls[0][0];
      expect(csv).toContain('Name');
      expect(csv).toContain('Acme');
      expect(csv).not.toContain('555-1234');
    } finally {
      spy.mockRestore();
    }
  });
});
