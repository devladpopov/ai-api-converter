/**
 * ai-api-converter
 *
 * Zero-dependency TypeScript library for converting between
 * OpenAI, Anthropic, Gemini, and Ollama API formats.
 *
 * Usage:
 *   import { convert, openaiAdapter, anthropicAdapter } from 'ai-api-converter'
 *
 *   // Convert an OpenAI request to Anthropic format
 *   const anthropicBody = convert(request, 'openai', 'anthropic')
 */

// ─── Public types ─────────────────────────────────────────
export type {
  // Universal format
  Role,
  ContentPart,
  TextPart,
  ImagePart,
  Message,
  SystemMessage,
  UserMessage,
  AssistantMessage,
  ToolMessage,
  Tool,
  ToolFunction,
  ToolCall,
  ToolResult,
  ToolChoice,
  ChatRequest,
  ChatResponse,
  Choice,
  Usage,
  StreamChunk,
  StreamDelta,
  JsonSchema,
  Provider,
  Adapter,
  // Provider-specific
  OpenAIChatRequest,
  OpenAIChatResponse,
  OpenAIStreamChunk,
  AnthropicChatRequest,
  AnthropicChatResponse,
  AnthropicStreamEvent,
  GeminiChatRequest,
  GeminiChatResponse,
  GeminiStreamChunk,
} from './types/index.js'

// ─── Adapters ─────────────────────────────────────────────
export {
  openaiAdapter,
  anthropicAdapter,
  createAnthropicAdapter,
  geminiAdapter,
  ollamaAdapter,
} from './adapters/index.js'

// ─── Convert helpers ──────────────────────────────────────
import type { ChatRequest, ChatResponse, StreamChunk, Provider } from './types/common.js'
import { openaiAdapter } from './adapters/openai.js'
import { anthropicAdapter } from './adapters/anthropic.js'
import { geminiAdapter } from './adapters/gemini.js'
import { ollamaAdapter } from './adapters/ollama.js'
import type { Adapter } from './types/common.js'

const adapters: Record<Provider, Adapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  gemini: geminiAdapter,
  ollama: ollamaAdapter,
}

/**
 * Convert a universal ChatRequest to a provider-specific request body.
 *
 * @example
 * const body = toProviderRequest(request, 'anthropic')
 * // body is AnthropicChatRequest, ready to send
 */
export function toProviderRequest(request: ChatRequest, provider: Provider): unknown {
  return adapters[provider].toProviderRequest(request)
}

/**
 * Convert a provider-specific response to the universal ChatResponse.
 *
 * @example
 * const response = fromProviderResponse(rawBody, 'anthropic')
 */
export function fromProviderResponse(raw: unknown, provider: Provider): ChatResponse {
  return adapters[provider].fromProviderResponse(raw)
}

/**
 * Convert a provider-specific SSE stream chunk to the universal StreamChunk.
 * Returns null for chunks that carry no meaningful data (e.g. keepalive events).
 *
 * @example
 * const chunk = fromProviderStreamChunk(parsedData, 'anthropic')
 * if (chunk) { ... }
 */
export function fromProviderStreamChunk(raw: unknown, provider: Provider): StreamChunk | null {
  return adapters[provider].fromProviderStreamChunk(raw)
}

/**
 * Convert a universal ChatRequest directly into a provider-specific request body.
 * Alias for toProviderRequest with a more natural name.
 *
 * @example
 * const openaiBody = convert(request, 'anthropic', 'openai')
 * //  ^ converts an "anthropic-style" universal request to OpenAI format
 *
 * Note: The fromProvider arg is currently unused (canonical format is provider-agnostic),
 * but is kept for future cross-provider direct conversion shortcuts.
 */
export function convert(
  request: ChatRequest,
  _fromProvider: Provider | 'universal',
  toProvider: Provider,
): unknown {
  return adapters[toProvider].toProviderRequest(request)
}

/**
 * Get the adapter for a specific provider.
 */
export function getAdapter(provider: Provider): Adapter {
  return adapters[provider]
}
