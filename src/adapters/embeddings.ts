import type {
  EmbeddingAdapter,
  EmbeddingRequest,
  EmbeddingResponse,
  Embedding,
  EmbeddingProvider,
  OpenAIEmbeddingRequest,
  OpenAIEmbeddingResponse,
  GeminiEmbeddingRequest,
  GeminiBatchEmbeddingRequest,
  GeminiBatchEmbeddingResponse,
  OllamaEmbedRequest,
  OllamaEmbedResponse,
} from '../types/embeddings.js'
import { mergeExtra } from '../utils/safe-merge.js'

// ─── OpenAI Embeddings ──────────────────────────────────

export const openaiEmbeddingAdapter: EmbeddingAdapter = {
  provider: 'openai',

  toProviderRequest(request: EmbeddingRequest): OpenAIEmbeddingRequest {
    const result: OpenAIEmbeddingRequest = {
      model: request.model,
      input: request.input,
    }
    if (request.extra) {
      mergeExtra(result as unknown as Record<string, unknown>, request.extra)
    }
    return result
  },

  fromProviderResponse(raw: unknown): EmbeddingResponse {
    const r = raw as OpenAIEmbeddingResponse
    return {
      model: r.model,
      embeddings: r.data.map((d): Embedding => ({
        index: d.index,
        values: d.embedding,
      })),
      usage: {
        promptTokens: r.usage.prompt_tokens,
        totalTokens: r.usage.total_tokens,
      },
    }
  },
}

// ─── Gemini Embeddings ──────────────────────────────────

export const geminiEmbeddingAdapter: EmbeddingAdapter = {
  provider: 'gemini',

  toProviderRequest(request: EmbeddingRequest): GeminiBatchEmbeddingRequest {
    const inputs = Array.isArray(request.input) ? request.input : [request.input]
    // Gemini batchEmbedContents requires the "models/" prefix
    const model = request.model.startsWith('models/') ? request.model : `models/${request.model}`
    return {
      requests: inputs.map((text): GeminiEmbeddingRequest => ({
        model,
        content: { parts: [{ text }] },
      })),
    }
  },

  fromProviderResponse(raw: unknown): EmbeddingResponse {
    const r = raw as GeminiBatchEmbeddingResponse
    return {
      model: '',
      embeddings: r.embeddings.map((e, i): Embedding => ({
        index: i,
        values: e.values,
      })),
    }
  },
}

// ─── Ollama Embeddings ──────────────────────────────────

export const ollamaEmbeddingAdapter: EmbeddingAdapter = {
  provider: 'ollama',

  toProviderRequest(request: EmbeddingRequest): OllamaEmbedRequest {
    return {
      model: request.model,
      input: request.input,
    }
  },

  fromProviderResponse(raw: unknown): EmbeddingResponse {
    const r = raw as OllamaEmbedResponse
    return {
      model: r.model,
      embeddings: r.embeddings.map((values, i): Embedding => ({
        index: i,
        values,
      })),
    }
  },
}

// ─── Registry ───────────────────────────────────────────

const embeddingAdapters: Record<EmbeddingProvider, EmbeddingAdapter> = {
  openai: openaiEmbeddingAdapter,
  gemini: geminiEmbeddingAdapter,
  ollama: ollamaEmbeddingAdapter,
}

export function getEmbeddingAdapter(provider: EmbeddingProvider): EmbeddingAdapter {
  return embeddingAdapters[provider]
}

export function toEmbeddingProviderRequest(request: EmbeddingRequest, provider: EmbeddingProvider): unknown {
  return embeddingAdapters[provider].toProviderRequest(request)
}

export function fromEmbeddingProviderResponse(raw: unknown, provider: EmbeddingProvider): EmbeddingResponse {
  return embeddingAdapters[provider].fromProviderResponse(raw)
}
