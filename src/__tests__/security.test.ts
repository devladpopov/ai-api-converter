import { describe, it, expect } from 'bun:test'
import { toProviderRequest } from '../index.js'
import { mergeExtra } from '../utils/safe-merge.js'
import type { ChatRequest } from '../index.js'

describe('prototype pollution prevention', () => {
  it('blocks __proto__ in extra field', () => {
    const before = (Object.prototype as Record<string, unknown>).isAdmin
    expect(before).toBeUndefined()

    const req: ChatRequest = {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'test' }],
      extra: JSON.parse('{"__proto__": {"isAdmin": true}}'),
    }
    toProviderRequest(req, 'openai')

    const after = (Object.prototype as Record<string, unknown>).isAdmin
    expect(after).toBeUndefined()
  })

  it('blocks constructor and prototype keys', () => {
    const result: Record<string, unknown> = { a: 1 }
    mergeExtra(result, { constructor: 'bad', prototype: 'bad', normal: 'ok' })
    expect(result.constructor).not.toBe('bad')
    expect(result.normal).toBe('ok')
  })

  it('does not overwrite explicit fields via extra', () => {
    const req: ChatRequest = {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'test' }],
      maxTokens: 100,
      extra: { max_tokens: 9999, model: 'hacked-model' },
    }
    const body = toProviderRequest(req, 'openai') as Record<string, unknown>
    expect(body.max_tokens).toBe(100) // explicit field wins
    expect(body.model).toBe('gpt-4o') // explicit field wins
  })

  it('allows extra keys that do not conflict', () => {
    const req: ChatRequest = {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'test' }],
      extra: { frequency_penalty: 0.5, logprobs: true },
    }
    const body = toProviderRequest(req, 'openai') as Record<string, unknown>
    expect(body.frequency_penalty).toBe(0.5)
    expect(body.logprobs).toBe(true)
  })
})

describe('SSE buffer overflow prevention', () => {
  it('throws on oversized SSE line', async () => {
    const { parseSSEStream } = await import('../utils/sse.js')
    // Create a stream with 2MB of data without newlines
    const bigData = 'x'.repeat(2 * 1024 * 1024)
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(bigData))
        controller.close()
      },
    })

    let threw = false
    try {
      for await (const _chunk of parseSSEStream(stream, 'openai')) {
        // should not reach here
      }
    } catch (e) {
      threw = true
      expect((e as Error).message).toContain('maximum buffer size')
    }
    expect(threw).toBe(true)
  })
})
