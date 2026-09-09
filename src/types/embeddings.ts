/**
 * Universal embedding types.
 * Covers OpenAI, Gemini, and Ollama embedding APIs.
 * Note: Anthropic does NOT have a native embeddings API.
 */

export type EmbeddingProvider = 'openai' | 'gemini' | 'ollama'

// ─── Universal format ────────────────────────────────────

export interface EmbeddingRequest {
  model: string
  input: string | string[]
  /** Provider-specific options */
  extra?: Record<string, unknown>
}

export interface Embedding {
  index: number
  values: number[]
}

export interface EmbeddingResponse {
  model: string
  embeddings: Embedding[]
  usage?: {
    promptTokens: number
    totalTokens: number
  }
}

// ─── OpenAI format ───────────────────────────────────────

export interface OpenAIEmbeddingRequest {
  model: string
  input: string | string[]
  encoding_format?: 'float' | 'base64'
  [key: string]: unknown
}

export interface OpenAIEmbeddingResponse {
  object: 'list'
  model: string
  data: {
    object: 'embedding'
    index: number
    embedding: number[]
  }[]
  usage: {
    prompt_tokens: number
    total_tokens: number
  }
}

// ─── Gemini format ───────────────────────────────────────

export interface GeminiEmbeddingRequest {
  model: string
  content: {
    parts: { text: string }[]
  }
  [key: string]: unknown
}

export interface GeminiBatchEmbeddingRequest {
  requests: GeminiEmbeddingRequest[]
}

export interface GeminiEmbeddingResponse {
  embedding: {
    values: number[]
  }
}

export interface GeminiBatchEmbeddingResponse {
  embeddings: {
    values: number[]
  }[]
}

// ─── Ollama format ───────────────────────────────────────
// Ollama uses the same format as OpenAI for /v1/embeddings
// but also has /api/embed with a different format

export interface OllamaEmbedRequest {
  model: string
  input: string | string[]
}

export interface OllamaEmbedResponse {
  model: string
  embeddings: number[][]
}

// ─── Adapter interface ───────────────────────────────────

export interface EmbeddingAdapter {
  provider: EmbeddingProvider
  toProviderRequest(request: EmbeddingRequest): unknown
  fromProviderResponse(raw: unknown): EmbeddingResponse
}
