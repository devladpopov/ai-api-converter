import { describe, it, expect } from 'bun:test'
import { openaiAdapter } from '../adapters/openai.js'
import type { ChatRequest, OpenAIChatResponse } from '../index.js'

const baseRequest: ChatRequest = {
  model: 'gpt-4o',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello!' },
  ],
}

describe('openaiAdapter.toProviderRequest', () => {
  it('passes through basic message structure', () => {
    const body = openaiAdapter.toProviderRequest(baseRequest) as Record<string, unknown>
    expect(body.model).toBe('gpt-4o')
    expect(Array.isArray(body.messages)).toBe(true)
  })

  it('converts system message correctly', () => {
    const body = openaiAdapter.toProviderRequest(baseRequest) as { messages: { role: string; content: string }[] }
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[0].content).toBe('You are a helpful assistant.')
  })

  it('maps maxTokens to max_tokens', () => {
    const req: ChatRequest = { ...baseRequest, maxTokens: 1024, temperature: 0.5 }
    const body = openaiAdapter.toProviderRequest(req) as Record<string, unknown>
    expect(body.max_tokens).toBe(1024)
    expect(body.temperature).toBe(0.5)
  })

  it('converts tool definitions', () => {
    const req: ChatRequest = {
      ...baseRequest,
      tools: [{
        type: 'function',
        function: { name: 'get_weather', description: 'Get weather', parameters: { type: 'object', properties: { location: { type: 'string' } }, required: ['location'] } },
      }],
      toolChoice: 'auto',
    }
    const body = openaiAdapter.toProviderRequest(req) as Record<string, unknown>
    expect(Array.isArray(body.tools)).toBe(true)
    expect(body.tool_choice).toBe('auto')
  })

  it('converts assistant message with tool calls', () => {
    const req: ChatRequest = {
      model: 'gpt-4o',
      messages: [
        { role: 'user', content: 'What is the weather?' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [{ id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"location":"London"}' } }],
        },
        { role: 'tool', content: '{"temp":15}', toolCallId: 'call_1' },
      ],
    }
    const body = openaiAdapter.toProviderRequest(req) as { messages: { role: string; tool_call_id?: string }[] }
    expect(body.messages[1].role).toBe('assistant')
    expect(body.messages[2].role).toBe('tool')
    expect(body.messages[2].tool_call_id).toBe('call_1')
  })
})

describe('openaiAdapter.fromProviderResponse', () => {
  it('converts a basic response', () => {
    const raw: OpenAIChatResponse = {
      id: 'chatcmpl-123',
      object: 'chat.completion',
      created: 1699000000,
      model: 'gpt-4o',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: 'Hello!' },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }
    const response = openaiAdapter.fromProviderResponse(raw)
    expect(response.id).toBe('chatcmpl-123')
    expect(response.choices[0].message.content).toBe('Hello!')
    expect(response.choices[0].finishReason).toBe('stop')
    expect(response.usage?.totalTokens).toBe(15)
  })

  it('converts tool calls in response', () => {
    const raw: OpenAIChatResponse = {
      id: 'chatcmpl-456',
      object: 'chat.completion',
      created: 1699000000,
      model: 'gpt-4o',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'call_abc', type: 'function', function: { name: 'get_weather', arguments: '{"location":"Paris"}' } }],
        },
        finish_reason: 'tool_calls',
      }],
    }
    const response = openaiAdapter.fromProviderResponse(raw)
    expect(response.choices[0].finishReason).toBe('tool_calls')
    expect(response.choices[0].message.toolCalls?.[0].id).toBe('call_abc')
    expect(response.choices[0].message.toolCalls?.[0].function.name).toBe('get_weather')
  })
})
