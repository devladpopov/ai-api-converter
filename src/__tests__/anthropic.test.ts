import { describe, it, expect, beforeEach } from 'bun:test'
import { createAnthropicAdapter } from '../adapters/anthropic.js'
import type { ChatRequest, AnthropicChatRequest, AnthropicChatResponse } from '../index.js'

describe('anthropicAdapter.toProviderRequest', () => {
  let adapter: ReturnType<typeof createAnthropicAdapter>

  beforeEach(() => {
    adapter = createAnthropicAdapter()
  })

  it('extracts system prompt to top-level field', () => {
    const req: ChatRequest = {
      model: 'claude-opus-4-5',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' },
      ],
    }
    const body = adapter.toProviderRequest(req) as AnthropicChatRequest
    expect(body.system).toBe('You are a helpful assistant.')
    expect(body.messages).toHaveLength(1)
    expect(body.messages[0].role).toBe('user')
  })

  it('adds default max_tokens when not specified', () => {
    const req: ChatRequest = {
      model: 'claude-opus-4-5',
      messages: [{ role: 'user', content: 'Hi' }],
    }
    const body = adapter.toProviderRequest(req) as AnthropicChatRequest
    expect(body.max_tokens).toBe(4096)
  })

  it('maps maxTokens correctly', () => {
    const req: ChatRequest = {
      model: 'claude-opus-4-5',
      messages: [{ role: 'user', content: 'Hi' }],
      maxTokens: 1000,
    }
    const body = adapter.toProviderRequest(req) as AnthropicChatRequest
    expect(body.max_tokens).toBe(1000)
  })

  it('converts tool definitions with input_schema', () => {
    const req: ChatRequest = {
      model: 'claude-opus-4-5',
      messages: [{ role: 'user', content: 'What is the weather?' }],
      tools: [{
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get the weather',
          parameters: { type: 'object', properties: { location: { type: 'string' } }, required: ['location'] },
        },
      }],
    }
    const body = adapter.toProviderRequest(req) as AnthropicChatRequest
    expect(body.tools?.[0].name).toBe('get_weather')
    expect(body.tools?.[0].input_schema).toBeDefined()
    expect((body.tools?.[0].input_schema as Record<string, unknown>).type).toBe('object')
  })

  it('converts toolChoice: required -> any', () => {
    const req: ChatRequest = {
      model: 'claude-opus-4-5',
      messages: [{ role: 'user', content: 'Hi' }],
      toolChoice: 'required',
    }
    const body = adapter.toProviderRequest(req) as AnthropicChatRequest
    expect(body.tool_choice).toEqual({ type: 'any' })
  })

  it('converts toolChoice: none', () => {
    const req: ChatRequest = {
      model: 'claude-opus-4-5',
      messages: [{ role: 'user', content: 'Hi' }],
      toolChoice: 'none',
    }
    const body = adapter.toProviderRequest(req) as AnthropicChatRequest
    expect(body.tool_choice).toEqual({ type: 'none' })
  })

  it('converts tool result messages to user messages with tool_result blocks', () => {
    const req: ChatRequest = {
      model: 'claude-opus-4-5',
      messages: [
        { role: 'user', content: 'What is the weather in London?' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [{ id: 'toolu_01', type: 'function', function: { name: 'get_weather', arguments: '{"location":"London"}' } }],
        },
        { role: 'tool', content: '{"temp":15,"unit":"C"}', toolCallId: 'toolu_01' },
      ],
    }
    const body = adapter.toProviderRequest(req) as AnthropicChatRequest
    // Should be 3 messages: user, assistant, user (with tool_result)
    expect(body.messages).toHaveLength(3)
    const lastMsg = body.messages[2]
    expect(lastMsg.role).toBe('user')
    expect(Array.isArray(lastMsg.content)).toBe(true)
    const blocks = lastMsg.content as { type: string; tool_use_id?: string }[]
    expect(blocks[0].type).toBe('tool_result')
    expect(blocks[0].tool_use_id).toBe('toolu_01')
  })

  it('merges adjacent same-role messages', () => {
    const req: ChatRequest = {
      model: 'claude-opus-4-5',
      messages: [
        { role: 'user', content: 'First' },
        { role: 'user', content: 'Second' },
      ],
    }
    const body = adapter.toProviderRequest(req) as AnthropicChatRequest
    expect(body.messages).toHaveLength(1)
    expect(body.messages[0].role).toBe('user')
  })
})

describe('anthropicAdapter.fromProviderResponse', () => {
  it('converts a basic text response', () => {
    const raw: AnthropicChatResponse = {
      id: 'msg_123',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello!' }],
      model: 'claude-opus-4-5',
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    }
    const adapter = createAnthropicAdapter()
    const response = adapter.fromProviderResponse(raw)
    expect(response.id).toBe('msg_123')
    expect(response.choices[0].message.content).toBe('Hello!')
    expect(response.choices[0].finishReason).toBe('stop')
    expect(response.usage?.promptTokens).toBe(10)
    expect(response.usage?.totalTokens).toBe(15)
  })

  it('converts tool_use blocks to toolCalls', () => {
    const raw: AnthropicChatResponse = {
      id: 'msg_456',
      type: 'message',
      role: 'assistant',
      content: [
        { type: 'text', text: 'Let me check the weather.' },
        { type: 'tool_use', id: 'toolu_01', name: 'get_weather', input: { location: 'London' } },
      ],
      model: 'claude-opus-4-5',
      stop_reason: 'tool_use',
      usage: { input_tokens: 20, output_tokens: 30 },
    }
    const adapter = createAnthropicAdapter()
    const response = adapter.fromProviderResponse(raw)
    expect(response.choices[0].finishReason).toBe('tool_calls')
    expect(response.choices[0].message.content).toBe('Let me check the weather.')
    expect(response.choices[0].message.toolCalls?.[0].id).toBe('toolu_01')
    expect(response.choices[0].message.toolCalls?.[0].function.name).toBe('get_weather')
    expect(JSON.parse(response.choices[0].message.toolCalls?.[0].function.arguments ?? '{}')).toEqual({ location: 'London' })
  })
})
