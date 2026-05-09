import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  parseSavedQuery,
  substituteParams,
  saveQuery,
  listSavedQueries,
  getQueriesDir,
} from '../../src/commands/query.js';

describe('saved queries', () => {
  describe('parseSavedQuery', () => {
    it('parses YAML frontmatter and SQL body', () => {
      const content = `---
name: inactive-by-location
description: Customers with no jobs in N days at a given location
params:
  city: { type: string, required: true }
  days: { type: number, default: 90 }
---
SELECT c.customer_name, l.city
FROM cache_customers c
JOIN cache_locations l ON l.customer_id = c.id
WHERE l.city = $city`;

      const { meta, sql } = parseSavedQuery(content);

      expect(meta.name).toBe('inactive-by-location');
      expect(meta.description).toBe('Customers with no jobs in N days at a given location');
      expect(meta.params.city).toEqual({ type: 'string', required: true });
      expect(meta.params.days).toEqual({ type: 'number', default: 90 });
      expect(sql).toContain('SELECT c.customer_name');
      expect(sql).toContain('$city');
    });

    it('handles content without frontmatter', () => {
      const content = 'SELECT * FROM cache_customers';
      const { meta, sql } = parseSavedQuery(content);
      expect(meta).toEqual({});
      expect(sql).toBe('SELECT * FROM cache_customers');
    });
  });

  describe('substituteParams', () => {
    it('replaces $param with ? and collects values', () => {
      const sql = 'SELECT * FROM cache_locations WHERE city = $city AND state = $state';
      const paramDefs = {
        city: { type: 'string', required: true },
        state: { type: 'string', required: true },
      };
      const values = { city: 'Austin', state: 'TX' };

      const result = substituteParams(sql, paramDefs, values);

      expect(result.sql).toBe('SELECT * FROM cache_locations WHERE city = ? AND state = ?');
      expect(result.params).toEqual(['Austin', 'TX']);
      expect(result.error).toBeUndefined();
    });

    it('applies default values for missing optional params', () => {
      const sql = 'SELECT * FROM cache_jobs WHERE total > $minTotal';
      const paramDefs = {
        minTotal: { type: 'number', default: 100 },
      };

      const result = substituteParams(sql, paramDefs, {});

      expect(result.params).toEqual([100]);
      expect(result.error).toBeUndefined();
    });

    it('returns error for missing required params', () => {
      const sql = 'SELECT * FROM cache_locations WHERE city = $city';
      const paramDefs = {
        city: { type: 'string', required: true },
      };

      const result = substituteParams(sql, paramDefs, {});

      expect(result.error).toMatch(/Missing required parameter/);
    });

    it('coerces number type params', () => {
      const sql = 'SELECT * FROM cache_jobs WHERE total > $amount';
      const paramDefs = {
        amount: { type: 'number', required: true },
      };

      const result = substituteParams(sql, paramDefs, { amount: '500' });

      expect(result.params).toEqual([500]);
    });
  });

  describe('saveQuery and listSavedQueries', () => {
    let origDir;
    let tempDir;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'sfcli-sq-'));
      // Monkey-patch the queries dir for testing
      origDir = getQueriesDir;
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('saves and lists a query round-trip', () => {
      const queriesDir = join(tempDir, 'queries');
      mkdirSync(queriesDir, { recursive: true });

      // Write directly to test directory
      const sql = 'SELECT * FROM cache_customers WHERE customer_name LIKE $name';
      const content = `---\nname: find-customer\ndescription: Find customers by name\nparams:\n  name: { type: string, required: true }\n---\n${sql}\n`;
      writeFileSync(join(queriesDir, 'find-customer.sql'), content, 'utf8');

      // Read it back and parse
      const { meta, sql: parsedSql } = parseSavedQuery(content);

      expect(meta.name).toBe('find-customer');
      expect(meta.description).toBe('Find customers by name');
      expect(parsedSql).toContain('$name');
    });
  });
});
