import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock ollama and claude modules
vi.mock('../../src/ai/ollama.js', () => ({
  createOllamaClient: vi.fn(),
}));
vi.mock('../../src/ai/claude.js', () => ({
  createClaudeClient: vi.fn(),
}));
vi.mock('../../src/config/index.js', () => ({
  getConfig: vi.fn(() => ({
    get: vi.fn(() => undefined),
  })),
}));

import { resolveProvider } from '../../src/ai/provider.js';
import { createOllamaClient } from '../../src/ai/ollama.js';
import { createClaudeClient } from '../../src/ai/claude.js';
import { getConfig } from '../../src/config/index.js';

const mockOllamaGenerate = vi.fn().mockResolvedValue('SELECT 1');
const mockClaudeGenerate = vi.fn().mockResolvedValue('SELECT 1');

beforeEach(() => {
  vi.resetAllMocks();
  // Default: Ollama available
  createOllamaClient.mockReturnValue({
    generate: mockOllamaGenerate,
    isAvailable: vi.fn().mockResolvedValue(true),
  });
  createClaudeClient.mockReturnValue({
    generate: mockClaudeGenerate,
  });
  getConfig.mockReturnValue({
    get: vi.fn(() => undefined),
  });
});

afterEach(() => {
  // Clean up env vars
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.AI_PROVIDER;
  delete process.env.OLLAMA_URL;
  delete process.env.OLLAMA_MODEL;
  delete process.env.AI_MODEL;
});

describe('resolveProvider — deep mode', () => {
  it('returns cloud provider when --deep and API key configured', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const result = await resolveProvider({ deep: true });
    expect(result.providerName).toBe('claude');
    expect(createClaudeClient).toHaveBeenCalled();
  });

  it('throws when --deep but no API key', async () => {
    await expect(resolveProvider({ deep: true })).rejects.toThrow(/API key/i);
  });
});

describe('resolveProvider — default (local)', () => {
  it('returns Ollama when available', async () => {
    const result = await resolveProvider({ deep: false });
    expect(result.providerName).toBe('ollama');
    expect(createOllamaClient).toHaveBeenCalled();
  });

  it('falls back to cloud when Ollama unavailable and API key set', async () => {
    createOllamaClient.mockReturnValue({
      generate: mockOllamaGenerate,
      isAvailable: vi.fn().mockResolvedValue(false),
    });
    process.env.ANTHROPIC_API_KEY = 'sk-test';

    const result = await resolveProvider({ deep: false });
    expect(result.providerName).toBe('claude');
    expect(result.fallback).toBe(true);
  });

  it('throws with setup instructions when nothing available', async () => {
    createOllamaClient.mockReturnValue({
      generate: mockOllamaGenerate,
      isAvailable: vi.fn().mockResolvedValue(false),
    });

    await expect(resolveProvider({ deep: false })).rejects.toThrow(/ollama/i);
  });
});

describe('resolveProvider — config resolution', () => {
  it('reads config from env vars first', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-env';
    const result = await resolveProvider({ deep: true });
    expect(createClaudeClient).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'sk-env' })
    );
  });

  it('falls back to config file when no env vars', async () => {
    const mockGet = vi.fn(key => {
      if (key === 'ai_api_key') return 'sk-config';
      if (key === 'ai_provider') return 'claude';
      if (key === 'ai_model') return 'claude-sonnet-4-20250514';
      return undefined;
    });
    getConfig.mockReturnValue({ get: mockGet });

    const result = await resolveProvider({ deep: true });
    expect(createClaudeClient).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'sk-config' })
    );
  });
});
