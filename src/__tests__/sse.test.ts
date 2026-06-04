import { describe, it, expect } from 'bun:test'
import { parseSSEStream, collectStreamText } from '../utils/sse.js'

function createStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text))
      controller.close()
    },
  })
}

function createChunkedStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
}

describe('parseSSEStream - OpenAI format', () => {
  it('parses basic text streaming chunks', async () => {
    const sseData = [
      'data: {"id":"chatcmpl-1","model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl-1","model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl-1","model":"gpt-4o","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl-1","model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ].join('')

    const stream = createStream(sseData)
    const chunks = []
    for await (const chunk of parseSSEStream(stream, 'openai')) {
      chunks.push(chunk)
    }

    expect(chunks.length).toBe(4)
    expect(chunks[0].choices[0].delta.role).toBe('assistant')
    expect(chunks[1].choices[0].delta.content).toBe('Hello')
    expect(chunks[2].choices[0].delta.content).toBe(' world')
    expect(chunks[3].choices[0].finishReason).toBe('stop')
  })

  it('handles tool call streaming', async () => {
    const sseData = [
      'data: {"id":"chatcmpl-2","model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[{"id":"call_1","type":"function","function":{"name":"get_weather","arguments":""}}]},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl-2","model":"gpt-4o","choices":[{"index":0,"delta":{"tool_calls":[{"function":{"arguments":"{\\"loc"}}]},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl-2","model":"gpt-4o","choices":[{"index":0,"delta":{"tool_calls":[{"function":{"arguments":"ation\\":\\"London\\"}"}}]},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl-2","model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n',
      'data: [DONE]\n\n',
    ].join('')

    const stream = createStream(sseData)
    const chunks = []
    for await (const chunk of parseSSEStream(stream, 'openai')) {
      chunks.push(chunk)
    }

    expect(chunks[0].choices[0].delta.toolCalls?.[0]?.id).toBe('call_1')
    expect(chunks[0].choices[0].delta.toolCalls?.[0]?.function?.name).toBe('get_weather')
    expect(chunks[3].choices[0].finishReason).toBe('tool_calls')
  })

  it('handles chunked delivery (data split across TCP frames)', async () => {
    const stream = createChunkedStream([
      'data: {"id":"c-1","model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Hel"}',
      ',"finish_reason":null}]}\n\ndata: {"id":"c-1","model":"gpt-4o","choices":[{"index":0,',
      '"delta":{"content":"lo"},"finish_reason":null}]}\n\ndata: [DONE]\n\n',
    ])

    const chunks = []
    for await (const chunk of parseSSEStream(stream, 'openai')) {
      chunks.push(chunk)
    }

    expect(chunks.length).toBe(2)
    expect(chunks[0].choices[0].delta.content).toBe('Hel')
    expect(chunks[1].choices[0].delta.content).toBe('lo')
  })
})

describe('parseSSEStream - Anthropic format', () => {
  it('parses Anthropic streaming events', async () => {
    const sseData = [
      'event: message_start\n',
      'data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[],"model":"claude-opus-4-5","stop_reason":null,"usage":{"input_tokens":10,"output_tokens":0}}}\n\n',
      'event: content_block_start\n',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
      'event: content_block_delta\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n',
      'event: content_block_delta\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}\n\n',
      'event: content_block_stop\n',
      'data: {"type":"content_block_stop","index":0}\n\n',
      'event: message_delta\n',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}\n\n',
      'event: message_stop\n',
      'data: {"type":"message_stop"}\n\n',
    ].join('')

    const stream = createStream(sseData)
    const chunks = []
    for await (const chunk of parseSSEStream(stream, 'anthropic')) {
      chunks.push(chunk)
    }

    // message_start and content_block_start return null, content_block_stop returns null, message_stop returns null
    // So we get: content_block_delta (Hello), content_block_delta ( world), message_delta
    const textChunks = chunks.filter(c => c.choices[0]?.delta?.content)
    expect(textChunks.length).toBe(2)
    expect(textChunks[0].choices[0].delta.content).toBe('Hello')
    expect(textChunks[1].choices[0].delta.content).toBe(' world')

    const finishChunk = chunks.find(c => c.choices[0]?.finishReason === 'stop')
    expect(finishChunk).toBeDefined()
  })
})

describe('collectStreamText', () => {
  it('collects all text from a stream', async () => {
    const sseData = [
      'data: {"id":"c-1","model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}\n\n',
      'data: {"id":"c-1","model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Hello "},"finish_reason":null}]}\n\n',
      'data: {"id":"c-1","model":"gpt-4o","choices":[{"index":0,"delta":{"content":"world!"},"finish_reason":null}]}\n\n',
      'data: {"id":"c-1","model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ].join('')

    const stream = createStream(sseData)
    const { text, chunks } = await collectStreamText(stream, 'openai')

    expect(text).toBe('Hello world!')
    expect(chunks.length).toBe(4)
  })
})
