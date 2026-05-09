import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 1024;

/**
 * Create a Claude API client for cloud LLM inference.
 * @param {Object} options
 * @param {string} options.apiKey - Anthropic API key
 * @param {string} [options.model] - Model identifier (default: claude-sonnet-4-20250514)
 * @returns {{ generate: Function }}
 */
export function createClaudeClient(options = {}) {
  const { apiKey, model = DEFAULT_MODEL } = options;

  if (!apiKey) {
    throw new Error('Claude API key is required. Set ANTHROPIC_API_KEY or configure via: sfcli config set ai_api_key <key>');
  }

  const client = new Anthropic({ apiKey });

  return {
    /**
     * Generate a completion from Claude.
     * @param {string} prompt - The user prompt
     * @param {Object} [opts]
     * @param {string} [opts.system] - System prompt
     * @param {number} [opts.maxTokens] - Max tokens (default: 1024)
     * @returns {Promise<string>}
     */
    async generate(prompt, opts = {}) {
      try {
        const response = await client.messages.create({
          model,
          max_tokens: opts.maxTokens || DEFAULT_MAX_TOKENS,
          system: opts.system || '',
          messages: [{ role: 'user', content: prompt }],
        });
        const textBlock = response.content?.find(block => block.type === 'text');
        if (!textBlock?.text) {
          throw new Error('Claude returned an empty response. Try rephrasing your question.');
        }
        return textBlock.text;
      } catch (err) {
        if (err.status === 401) {
          throw new Error('Invalid Claude API key. Check your ANTHROPIC_API_KEY or run: sfcli config set ai_api_key <key>');
        }
        if (err.status === 429) {
          throw new Error('Claude API rate limit exceeded. Please wait and try again.');
        }
        throw new Error(`Claude API error: ${err.message}`);
      }
    },
  };
}
