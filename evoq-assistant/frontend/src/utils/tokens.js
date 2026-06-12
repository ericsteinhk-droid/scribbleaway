// Rough token estimation: ~4 chars per token (conservative average)
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// Provider context window limits (in tokens)
export const CONTEXT_LIMITS = {
  anthropic: 200000,
  openai:    128000,
  gemini:    1000000,
};

/**
 * Calculate total tokens used by the current message history.
 * @param {Array} messages - array of {role, content} objects
 * @param {string} systemPrompt
 * @returns {number}
 */
export function calcContextTokens(messages, systemPrompt = '') {
  let total = estimateTokens(systemPrompt);
  for (const msg of messages) {
    total += estimateTokens(msg.content || msg.text || '');
  }
  return total;
}

/**
 * Get context usage as a percentage.
 * @param {number} used
 * @param {string} provider
 * @returns {number} 0–100
 */
export function contextPercent(used, provider) {
  const limit = CONTEXT_LIMITS[provider] || 128000;
  return Math.min(100, Math.round((used / limit) * 100));
}

/**
 * Format token count for display.
 * @param {number} n
 * @returns {string}
 */
export function fmtTokens(n) {
  if (!n) return '0';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

/**
 * Format cost in USD for display.
 * @param {number} usd
 * @returns {string}
 */
export function fmtCost(usd) {
  if (!usd) return '';
  if (usd < 0.001) return `$${(usd * 1000).toFixed(3)}m`;
  return `$${usd.toFixed(4)}`;
}
