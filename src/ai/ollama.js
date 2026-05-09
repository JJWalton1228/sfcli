import axios from 'axios';

const DEFAULT_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'llama3.1';
const TIMEOUT_MS = 120000;

/**
 * Create an Ollama client for local LLM inference.
 * @param {Object} options
 * @param {string} [options.url] - Ollama base URL (default: http://localhost:11434)
 * @param {string} [options.model] - Model name (default: llama3.1)
 * @returns {{ generate: Function, isAvailable: Function }}
 */
export function createOllamaClient(options = {}) {
  const url = options.url || DEFAULT_URL;
  const model = options.model || DEFAULT_MODEL;

  return {
    /**
     * Generate a completion from Ollama.
     * @param {string} prompt - The user prompt
     * @param {Object} [opts]
     * @param {string} [opts.system] - System prompt
     * @returns {Promise<string>}
     */
    async generate(prompt, opts = {}) {
      const response = await axios.post(`${url}/api/generate`, {
        model,
        prompt,
        system: opts.system || '',
        stream: false,
        options: {
          num_ctx: 8192,
          temperature: 0.2,
        },
      }, { timeout: TIMEOUT_MS });
      return response.data.response;
    },

    /**
     * Check if Ollama is running and reachable.
     * @returns {Promise<boolean>}
     */
    async isAvailable() {
      try {
        await axios.get(`${url}/api/tags`, { timeout: 5000 });
        return true;
      } catch {
        return false;
      }
    },
  };
}
