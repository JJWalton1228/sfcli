import { describe, it, expect, afterEach } from 'vitest';
import nock from 'nock';
import { createOllamaClient } from '../../src/ai/ollama.js';

const BASE_URL = 'http://localhost:11434';

afterEach(() => {
  nock.cleanAll();
});

describe('createOllamaClient', () => {
  it('returns an object with generate() and isAvailable()', () => {
    const client = createOllamaClient({ url: BASE_URL, model: 'llama3.1' });
    expect(typeof client.generate).toBe('function');
    expect(typeof client.isAvailable).toBe('function');
  });
});

describe('generate', () => {
  it('POSTs to /api/generate with correct payload', async () => {
    const scope = nock(BASE_URL)
      .post('/api/generate', body => {
        return body.model === 'llama3.1'
          && body.prompt === 'SELECT 1'
          && body.system === 'You are a SQL generator'
          && body.stream === false;
      })
      .reply(200, { response: 'SELECT 1 FROM dual' });

    const client = createOllamaClient({ url: BASE_URL, model: 'llama3.1' });
    const result = await client.generate('SELECT 1', { system: 'You are a SQL generator' });
    expect(result).toBe('SELECT 1 FROM dual');
    expect(scope.isDone()).toBe(true);
  });

  it('respects custom URL and model', async () => {
    const customUrl = 'http://192.168.1.100:11434';
    const scope = nock(customUrl)
      .post('/api/generate', body => body.model === 'mistral')
      .reply(200, { response: 'result' });

    const client = createOllamaClient({ url: customUrl, model: 'mistral' });
    const result = await client.generate('test prompt', { system: 'sys' });
    expect(result).toBe('result');
    expect(scope.isDone()).toBe(true);
  });
});

describe('isAvailable', () => {
  it('returns true when Ollama responds to GET /api/tags', async () => {
    nock(BASE_URL).get('/api/tags').reply(200, { models: [] });

    const client = createOllamaClient({ url: BASE_URL, model: 'llama3.1' });
    expect(await client.isAvailable()).toBe(true);
  });

  it('returns false on connection error', async () => {
    // Use a port that nothing is listening on — real ECONNREFUSED
    const client = createOllamaClient({ url: 'http://localhost:19999', model: 'llama3.1' });
    expect(await client.isAvailable()).toBe(false);
  });
});
