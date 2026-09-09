import { describe, test, expect } from 'bun:test'
import {
  openaiEmbeddingAdapter,
  geminiEmbeddingAdapter,
  ollamaEmbeddingAdapter,
  getEmbeddingAdapter,
  toEmbeddingProviderRequest,
  fromEmbeddingProviderResponse,
} from '../adapters/embeddings.js'
import type { EmbeddingRequest } from '../types/embeddings.js'

const sampleRequest: EmbeddingRequest = {
  model: 'text-embedding-3-small',
  input: 'Hello world',
}

const batchRequest: EmbeddingRequest = {
  model: 'text-embedding-3-small',
  input: ['Hello', 'World'],
}

describe('OpenAI Embedding Adapter', () => {
  test('toProviderRequest: single input', () => {
    const result = openaiEmbeddingAdapter.toProviderRequest(sampleRequest)
    expect(result).toEqual({
      model: 'text-embedding-3-small',
      input: 'Hello world',
    })
  })

  test('toProviderRequest: blocks prototype pollution via extra', () => {
    const result = openaiEmbeddingAdapter.toProviderRequest({
      ...sampleRequest,
      extra: JSON.parse('{"__proto__": {"polluted": true}, "safe": 1}'),
    }) as Record<string, unknown>
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.keys(result)).not.toContain('__proto__')
    expect(result.safe).toBe(1)
  })

  test('toProviderRequest: passes extra fields', () => {
    const result = openaiEmbeddingAdapter.toProviderRequest({
      ...sampleRequest,
      extra: { encoding_format: 'float', dimensions: 256 },
    }) as Record<string, unknown>
    expect(result.encoding_format).toBe('float')
    expect(result.dimensions).toBe(256)
  })

  test('fromProviderResponse: maps OpenAI format', () => {
    const raw = {
      object: 'list',
      model: 'text-embedding-3-small',
      data: [
        { object: 'embedding', index: 0, embedding: [0.1, 0.2, 0.3] },
        { object: 'embedding', index: 1, embedding: [0.4, 0.5, 0.6] },
      ],
      usage: { prompt_tokens: 5, total_tokens: 5 },
    }
    const result = openaiEmbeddingAdapter.fromProviderResponse(raw)
    expect(result.model).toBe('text-embedding-3-small')
    expect(result.embeddings).toHaveLength(2)
    expect(result.embeddings[0].values).toEqual([0.1, 0.2, 0.3])
    expect(result.usage?.promptTokens).toBe(5)
  })
})

describe('Gemini Embedding Adapter', () => {
  test('toProviderRequest: single input becomes batch', () => {
    const result = geminiEmbeddingAdapter.toProviderRequest(sampleRequest) as {
      requests: { model: string; content: { parts: { text: string }[] } }[]
    }
    expect(result.requests).toHaveLength(1)
    expect(result.requests[0].model).toBe('models/text-embedding-3-small')
    expect(result.requests[0].content.parts[0].text).toBe('Hello world')
  })

  test('toProviderRequest: preserves existing models/ prefix', () => {
    const result = geminiEmbeddingAdapter.toProviderRequest({
      model: 'models/text-embedding-004',
      input: 'Hi',
    }) as { requests: { model: string }[] }
    expect(result.requests[0].model).toBe('models/text-embedding-004')
  })

  test('toProviderRequest: batch input creates multiple requests', () => {
    const result = geminiEmbeddingAdapter.toProviderRequest(batchRequest) as {
      requests: unknown[]
    }
    expect(result.requests).toHaveLength(2)
  })

  test('fromProviderResponse: maps Gemini batch format', () => {
    const raw = {
      embeddings: [
        { values: [0.1, 0.2] },
        { values: [0.3, 0.4] },
      ],
    }
    const result = geminiEmbeddingAdapter.fromProviderResponse(raw)
    expect(result.embeddings).toHaveLength(2)
    expect(result.embeddings[0].index).toBe(0)
    expect(result.embeddings[1].values).toEqual([0.3, 0.4])
  })
})

describe('Ollama Embedding Adapter', () => {
  test('toProviderRequest: maps to Ollama embed format', () => {
    const result = ollamaEmbeddingAdapter.toProviderRequest(sampleRequest) as {
      model: string
      input: string
    }
    expect(result.model).toBe('text-embedding-3-small')
    expect(result.input).toBe('Hello world')
  })

  test('fromProviderResponse: maps Ollama embed response', () => {
    const raw = {
      model: 'nomic-embed-text',
      embeddings: [[0.1, 0.2], [0.3, 0.4]],
    }
    const result = ollamaEmbeddingAdapter.fromProviderResponse(raw)
    expect(result.model).toBe('nomic-embed-text')
    expect(result.embeddings).toHaveLength(2)
    expect(result.embeddings[0].values).toEqual([0.1, 0.2])
  })
})

describe('Embedding registry', () => {
  test('getEmbeddingAdapter returns correct adapter', () => {
    expect(getEmbeddingAdapter('openai').provider).toBe('openai')
    expect(getEmbeddingAdapter('gemini').provider).toBe('gemini')
    expect(getEmbeddingAdapter('ollama').provider).toBe('ollama')
  })

  test('toEmbeddingProviderRequest delegates correctly', () => {
    const result = toEmbeddingProviderRequest(sampleRequest, 'openai') as Record<string, unknown>
    expect(result.model).toBe('text-embedding-3-small')
  })

  test('fromEmbeddingProviderResponse delegates correctly', () => {
    const raw = {
      object: 'list',
      model: 'text-embedding-3-small',
      data: [{ object: 'embedding', index: 0, embedding: [0.1] }],
      usage: { prompt_tokens: 1, total_tokens: 1 },
    }
    const result = fromEmbeddingProviderResponse(raw, 'openai')
    expect(result.embeddings).toHaveLength(1)
  })
})
