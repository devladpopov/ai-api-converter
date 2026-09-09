import { describe, test, expect } from 'bun:test'
import { countTokens, countMessageTokens } from '../utils/token-count.js'

describe('countTokens', () => {
  test('empty string returns 0', () => {
    expect(countTokens('')).toEqual({ tokens: 0, method: 'approximate' })
  })

  test('short English text', () => {
    const result = countTokens('Hello world')
    expect(result.tokens).toBeGreaterThan(0)
    expect(result.method).toBe('approximate')
  })

  test('OpenAI: ~4 chars per token', () => {
    // 20 chars / 4 = 5 tokens
    const result = countTokens('12345678901234567890', 'openai')
    expect(result.tokens).toBe(5)
  })

  test('Anthropic: ~3.5 chars per token', () => {
    // 14 chars / 3.5 = 4 tokens
    const result = countTokens('12345678901234', 'anthropic')
    expect(result.tokens).toBe(4)
  })

  test('Gemini uses same ratio as OpenAI', () => {
    const text = 'This is a test string'
    const openai = countTokens(text, 'openai')
    const gemini = countTokens(text, 'gemini')
    expect(openai.tokens).toBe(gemini.tokens)
  })

  test('defaults to openai provider', () => {
    const explicit = countTokens('hello', 'openai')
    const defaulted = countTokens('hello')
    expect(explicit.tokens).toBe(defaulted.tokens)
  })
})

describe('countMessageTokens', () => {
  test('empty messages array', () => {
    const result = countMessageTokens([])
    // Only the reply priming overhead (2 tokens)
    expect(result.tokens).toBe(2)
    expect(result.method).toBe('approximate')
  })

  test('single message with content', () => {
    const result = countMessageTokens([
      { role: 'user', content: 'Hello world' },
    ])
    // 4 (message overhead) + role tokens + content tokens + 2 (priming)
    expect(result.tokens).toBeGreaterThan(4)
  })

  test('multiple messages add up', () => {
    const single = countMessageTokens([
      { role: 'user', content: 'Hi' },
    ])
    const double = countMessageTokens([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
    ])
    expect(double.tokens).toBeGreaterThan(single.tokens)
  })

  test('null content is handled', () => {
    const result = countMessageTokens([
      { role: 'assistant', content: null },
    ])
    expect(result.tokens).toBeGreaterThan(0) // At least overhead
  })
})
