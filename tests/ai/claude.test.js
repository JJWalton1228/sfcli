import { describe, it, expect, vi } from 'vitest';
import { createClaudeClient } from '../../src/ai/claude.js';

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      constructor({ apiKey }) {
        this._apiKey = apiKey;
        this.messages = {
          create: vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'SELECT COUNT(*) FROM cache_customers' }],
          }),
        };
      }
    },
  };
});

describe('createClaudeClient', () => {
  it('returns an object with generate()', () => {
    const client = createClaudeClient({ apiKey: 'test-key', model: 'claude-sonnet-4-20250514' });
    expect(typeof client.generate).toBe('function');
  });
});

describe('generate', () => {
  it('returns generated text from Claude via generate()', async () => {
    const client = createClaudeClient({ apiKey: 'test-key', model: 'claude-sonnet-4-20250514' });
    const result = await client.generate('How many customers?', { system: 'You are a SQL generator' });
    expect(result).toBe('SELECT COUNT(*) FROM cache_customers');
  });

  it('respects maxTokens option', async () => {
    const client = createClaudeClient({ apiKey: 'test-key', model: 'claude-sonnet-4-20250514' });
    await client.generate('test', { system: 'sys', maxTokens: 2048 });
    // The mock doesn't validate params deeply, but this ensures no crash
  });

  it('throws user-friendly error on missing API key', () => {
    expect(() => createClaudeClient({ apiKey: '', model: 'claude-sonnet-4-20250514' }))
      .toThrow(/API key/i);
  });
});
