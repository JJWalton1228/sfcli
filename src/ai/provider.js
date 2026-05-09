import { createOllamaClient } from './ollama.js';
import { createClaudeClient } from './claude.js';
import { getConfig } from '../config/index.js';

/**
 * Resolve the AI provider based on flags and configuration.
 * @param {Object} [options]
 * @param {boolean} [options.deep] - Force cloud provider
 * @returns {Promise<{ generate: Function, providerName: string, fallback?: boolean }>}
 */
export async function resolveProvider(options = {}) {
  const config = getConfig();

  const aiApiKey = process.env.ANTHROPIC_API_KEY
    || config.get('ai_api_key');
  const aiProvider = process.env.AI_PROVIDER || config.get('ai_provider') || 'claude';
  const aiModel = process.env.AI_MODEL || config.get('ai_model') || 'claude-sonnet-4-20250514';
  const ollamaUrl = process.env.OLLAMA_URL || config.get('ollama_url') || 'http://localhost:11434';
  const ollamaModel = process.env.OLLAMA_MODEL || config.get('ollama_model') || 'llama3.1';

  // --deep: force cloud provider
  if (options.deep) {
    if (!aiApiKey) {
      throw new Error(
        'No AI API key configured for --deep mode.\n'
        + 'Set ANTHROPIC_API_KEY environment variable or run:\n'
        + '  sfcli config set ai_api_key <your-key>'
      );
    }
    const client = createCloudClient(aiProvider, aiApiKey, aiModel);
    return { generate: client.generate, providerName: aiProvider };
  }

  // Default: try Ollama first
  const ollama = createOllamaClient({ url: ollamaUrl, model: ollamaModel });
  if (await ollama.isAvailable()) {
    return { generate: ollama.generate, providerName: 'ollama' };
  }

  // Fallback: cloud provider if API key is configured
  if (aiApiKey) {
    const client = createCloudClient(aiProvider, aiApiKey, aiModel);
    return { generate: client.generate, providerName: aiProvider, fallback: true };
  }

  // Nothing available
  throw new Error(
    'No AI provider available.\n\n'
    + 'Option 1 — Local (Ollama):\n'
    + '  brew install ollama\n'
    + '  ollama serve\n'
    + '  ollama pull llama3.1\n\n'
    + 'Option 2 — Cloud (Claude API):\n'
    + '  export ANTHROPIC_API_KEY=<your-key>\n'
    + '  # or: sfcli config set ai_api_key <your-key>'
  );
}

function createCloudClient(provider, apiKey, model) {
  if (provider === 'claude') {
    return createClaudeClient({ apiKey, model });
  }
  // OpenAI-ready: add case here when implemented
  throw new Error(`Unsupported AI provider: ${provider}. Supported: claude`);
}
