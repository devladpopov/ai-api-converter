import { describe, test, expect } from 'bun:test'
import { ollamaAdapter } from '../adapters/ollama.js'
import type { ChatRequest } from '../types/common.js'

const simpleRequest: ChatRequest = {
  model: 'llama3.1',
  messages: [
    { role: 'user', content: 'Hello' },
  ],
}

describe('Ollama Adapter', () => {
  test('basic request delegates to OpenAI format', () => {
    const result = ollamaAdapter.toProviderRequest(simpleRequest) as Record<string, unknown>
    expect(result.model).toBe('llama3.1')
    expect(Array.isArray(result.messages)).toBe(true)
  })

  test('disables streaming when tools are present', () => {
    const request: ChatRequest = {
      model: 'llama3.1',
      messages: [{ role: 'user', content: 'Get weather' }],
      tools: [{
        type: 'function',
        function: {
          name: 'getWeather',
          description: 'Get weather',
          parameters: { type: 'object', properties: {} },
        },
      }],
      stream: true,
    }
    const result = ollamaAdapter.toProviderRequest(request) as Record<string, unknown>
    expect(result.stream).toBe(false)
  })

  test('streaming without tools is preserved', () => {
    const request: ChatRequest = {
      ...simpleRequest,
      stream: true,
    }
    const result = ollamaAdapter.toProviderRequest(request) as Record<string, unknown>
    expect(result.stream).toBe(true)
  })

  test('fromProviderResponse delegates to OpenAI', () => {
    const raw = {
      id: 'chatcmpl-123',
      model: 'llama3.1',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: 'Hi!' },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
    }
    const result = ollamaAdapter.fromProviderResponse(raw)
    expect(result.model).toBe('llama3.1')
    expect(result.choices[0].message.content).toBe('Hi!')
  })

  test('fromProviderStreamChunk delegates to OpenAI', () => {
    const raw = {
      id: 'chatcmpl-123',
      model: 'llama3.1',
      choices: [{
        index: 0,
        delta: { content: 'Hello' },
        finish_reason: null,
      }],
    }
    const chunk = ollamaAdapter.fromProviderStreamChunk(raw)
    expect(chunk?.choices[0].delta.content).toBe('Hello')
  })
})
