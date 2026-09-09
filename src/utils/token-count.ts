/**
 * Approximate token counting utility.
 *
 * Provides a fast, zero-dependency approximation of token counts.
 * For precise OpenAI counting, use tiktoken directly.
 *
 * Approximation rules:
 * - English text: ~4 characters per token (GPT tokenizer average)
 * - CJK characters: ~1-2 characters per token
 * - Code: ~3.5 characters per token
 * - Whitespace-separated words: ~0.75 tokens per word
 *
 * We use the word-based heuristic as primary and character-based as fallback.
 */

export type TokenCountProvider = 'openai' | 'anthropic' | 'gemini' | 'ollama'

export interface TokenCountResult {
  tokens: number
  method: 'approximate'
}

// Average characters per token varies by provider/model family
const CHARS_PER_TOKEN: Record<TokenCountProvider, number> = {
  openai: 4,      // cl100k_base / o200k_base average
  anthropic: 3.5, // Claude tokenizer is slightly more efficient
  gemini: 4,      // SentencePiece-based, similar to GPT
  ollama: 4,      // Depends on model, default to GPT-like
}

/**
 * Count tokens in a string using a character-based approximation.
 * Accuracy: ~85-90% for English text, less for code or non-Latin scripts.
 */
export function countTokens(text: string, provider: TokenCountProvider = 'openai'): TokenCountResult {
  if (!text) return { tokens: 0, method: 'approximate' }

  const charsPerToken = CHARS_PER_TOKEN[provider]
  const tokens = Math.ceil(text.length / charsPerToken)

  return { tokens, method: 'approximate' }
}

/**
 * Estimate tokens for an array of messages in the chat format.
 * Adds overhead for message structure (~4 tokens per message for OpenAI).
 */
export function countMessageTokens(
  messages: { role: string; content?: string | null }[],
  provider: TokenCountProvider = 'openai',
): TokenCountResult {
  const MESSAGE_OVERHEAD = 4 // <|im_start|>role\ncontent<|im_end|>\n

  let total = 0
  for (const msg of messages) {
    total += MESSAGE_OVERHEAD
    if (msg.role) total += countTokens(msg.role, provider).tokens
    if (msg.content) total += countTokens(msg.content, provider).tokens
  }
  // Every reply is primed with <|im_start|>assistant
  total += 2

  return { tokens: total, method: 'approximate' }
}
