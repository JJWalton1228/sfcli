import { describe, it, expect } from 'vitest';
import { buildSqlPrompt, buildSummaryPrompt } from '../../src/ai/prompt.js';

describe('buildSqlPrompt', () => {
  const schemaText = 'Table: cache_customers\n  Columns: id, data\n  JSON fields: customer_name, city';
  const question = 'How many customers are in Dublin?';
  const currentDate = '2026-04-05';

  it('includes the schema text', () => {
    const { system } = buildSqlPrompt(schemaText, question, currentDate);
    expect(system).toContain(schemaText);
  });

  it('includes the current date', () => {
    const { system } = buildSqlPrompt(schemaText, question, currentDate);
    expect(system).toContain('2026-04-05');
  });

  it('includes the user question', () => {
    const { user } = buildSqlPrompt(schemaText, question, currentDate);
    expect(user).toContain('How many customers are in Dublin?');
  });

  it('includes json_extract instruction', () => {
    const { system } = buildSqlPrompt(schemaText, question, currentDate);
    expect(system).toContain('json_extract');
  });

  it('includes SELECT-only rule', () => {
    const { system } = buildSqlPrompt(schemaText, question, currentDate);
    expect(system).toMatch(/never.*insert|select.*only/i);
  });

  it('includes table name references', () => {
    const { system } = buildSqlPrompt(schemaText, question, currentDate);
    expect(system).toContain('cache_customers');
    expect(system).toContain('cache_jobs');
  });
});

describe('buildSummaryPrompt', () => {
  const question = 'How many customers in Dublin?';
  const sql = "SELECT COUNT(*) as count FROM cache_customers WHERE json_extract(data, '$.city') = 'Dublin'";
  const rows = [{ count: 12 }];
  const currentDate = '2026-04-05';

  it('includes the original question', () => {
    const { user } = buildSummaryPrompt(question, sql, rows, currentDate);
    expect(user).toContain(question);
  });

  it('includes the SQL that was executed', () => {
    const { user } = buildSummaryPrompt(question, sql, rows, currentDate);
    expect(user).toContain(sql);
  });

  it('includes result rows', () => {
    const { user } = buildSummaryPrompt(question, sql, rows, currentDate);
    expect(user).toContain('12');
  });

  it('includes row count', () => {
    const { user } = buildSummaryPrompt(question, sql, rows, currentDate);
    expect(user).toContain('1 row');
  });

  it('truncates data to 50 rows and notes truncation', () => {
    const manyRows = Array.from({ length: 80 }, (_, i) => ({ id: i, name: `Customer ${i}` }));
    const { user } = buildSummaryPrompt(question, sql, manyRows, currentDate);
    expect(user).toContain('50');
    expect(user).toMatch(/truncated|showing.*of.*80/i);
  });
});
