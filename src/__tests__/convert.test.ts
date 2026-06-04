import { describe, it, expect } from 'bun:test'
import { convert, toProviderRequest, fromProviderResponse, getAdapter } from '../index.js'
import type { ChatRequest } from '../index.js'

const request: ChatRequest = {
  model: 'gpt-4o',
  messages: [
    { role: 'system', content: 'Be helpful.' },
    { role: 'user', content: 'What is 2+2?' },
  ],
  maxTokens: 256,
  temperature: 0.5,
}

describe('convert()', () => {
  it('converts to openai format (passthrough)', () => {
    const body = convert(request, 'universal', 'openai') as Record<string, unknown>
    expect(body.model).toBe('gpt-4o')
    expect(body.max_tokens).toBe(256)
    expect(body.temperature).toBe(0.5)
  })

  it('converts to anthropic format', () => {
    const body = convert(request, 'universal', 'anthropic') as Record<string, unknown>
    expect(body.system).toBe('Be helpful.')
    expect(body.max_tokens).toBe(256)
    expect(Array.isArray(body.messages)).toBe(true)
  })

  it('converts to gemini format', () => {
    const body = convert(request, 'universal', 'gemini') as Record<string, unknown>
    expect((body.systemInstruction as { parts: { text: string }[] })?.parts?.[0]?.text).toBe('Be helpful.')
    expect(Array.isArray(body.contents)).toBe(true)
  })

  it('converts to ollama format (same as openai)', () => {
    const body = convert(request, 'universal', 'ollama') as Record<string, unknown>
    expect(body.model).toBe('gpt-4o')
    expect(body.max_tokens).toBe(256)
  })
})

describe('toProviderRequest()', () => {
  it('is equivalent to convert()', () => {
    const a = convert(request, 'universal', 'anthropic')
    const b = toProviderRequest(request, 'anthropic')
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

describe('fromProviderResponse()', () => {
  it('normalizes OpenAI response', () => {
    const raw = {
      id: 'chatcmpl-1',
      object: 'chat.completion',
      created: 1699000000,
      model: 'gpt-4o',
      choices: [{ index: 0, message: { role: 'assistant', content: '4' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 },
    }
    const response = fromProviderResponse(raw, 'openai')
    expect(response.choices[0].message.content).toBe('4')
    expect(response.choices[0].finishReason).toBe('stop')
  })
})

describe('getAdapter()', () => {
  it('returns the correct adapter', () => {
    expect(getAdapter('openai').provider).toBe('openai')
    expect(getAdapter('anthropic').provider).toBe('anthropic')
    expect(getAdapter('gemini').provider).toBe('gemini')
    expect(getAdapter('ollama').provider).toBe('ollama')
  })
})
