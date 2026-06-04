import { describe, it, expect } from 'bun:test'
import { geminiAdapter } from '../adapters/gemini.js'
import type { ChatRequest, GeminiChatRequest, GeminiChatResponse } from '../index.js'

describe('geminiAdapter.toProviderRequest', () => {
  it('extracts system prompt to systemInstruction', () => {
    const req: ChatRequest = {
      model: 'gemini-2.0-flash',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' },
      ],
    }
    const body = geminiAdapter.toProviderRequest(req) as GeminiChatRequest
    expect(body.systemInstruction?.parts[0].text).toBe('You are a helpful assistant.')
    expect(body.contents).toHaveLength(1)
    expect(body.contents[0].role).toBe('user')
  })

  it('maps assistant role to model', () => {
    const req: ChatRequest = {
      model: 'gemini-2.0-flash',
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
      ],
    }
    const body = geminiAdapter.toProviderRequest(req) as GeminiChatRequest
    expect(body.contents[0].role).toBe('user')
    expect(body.contents[1].role).toBe('model')
  })

  it('puts generationConfig params correctly', () => {
    const req: ChatRequest = {
      model: 'gemini-2.0-flash',
      messages: [{ role: 'user', content: 'Hi' }],
      maxTokens: 512,
      temperature: 0.7,
      topP: 0.9,
    }
    const body = geminiAdapter.toProviderRequest(req) as GeminiChatRequest
    expect(body.generationConfig?.maxOutputTokens).toBe(512)
    expect(body.generationConfig?.temperature).toBe(0.7)
    expect(body.generationConfig?.topP).toBe(0.9)
  })

  it('converts tool definitions to functionDeclarations', () => {
    const req: ChatRequest = {
      model: 'gemini-2.0-flash',
      messages: [{ role: 'user', content: 'Weather?' }],
      tools: [{
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get weather',
          parameters: { type: 'object', properties: { location: { type: 'string' } } },
        },
      }],
    }
    const body = geminiAdapter.toProviderRequest(req) as GeminiChatRequest
    expect(body.tools?.[0].functionDeclarations[0].name).toBe('get_weather')
  })

  it('converts toolChoice: required -> ANY mode', () => {
    const req: ChatRequest = {
      model: 'gemini-2.0-flash',
      messages: [{ role: 'user', content: 'Hi' }],
      toolChoice: 'required',
    }
    const body = geminiAdapter.toProviderRequest(req) as GeminiChatRequest
    expect(body.toolConfig?.functionCallingConfig.mode).toBe('ANY')
  })

  it('converts tool result messages to functionResponse parts', () => {
    const req: ChatRequest = {
      model: 'gemini-2.0-flash',
      messages: [
        { role: 'user', content: 'Weather in London?' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [{ id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"location":"London"}' } }],
        },
        { role: 'tool', content: '{"temp":15}', toolCallId: 'call_1' },
      ],
    }
    const body = geminiAdapter.toProviderRequest(req) as GeminiChatRequest
    const lastContent = body.contents[body.contents.length - 1]
    expect(lastContent.role).toBe('user')
    expect('functionResponse' in lastContent.parts[0]).toBe(true)
  })
})

describe('geminiAdapter.fromProviderResponse', () => {
  it('converts a basic text response', () => {
    const raw: GeminiChatResponse = {
      candidates: [{
        content: { role: 'model', parts: [{ text: 'Hello!' }] },
        finishReason: 'STOP',
        index: 0,
      }],
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3, totalTokenCount: 8 },
    }
    const response = geminiAdapter.fromProviderResponse(raw)
    expect(response.choices[0].message.content).toBe('Hello!')
    expect(response.choices[0].finishReason).toBe('stop')
    expect(response.usage?.totalTokens).toBe(8)
  })

  it('converts functionCall parts to toolCalls', () => {
    const raw: GeminiChatResponse = {
      candidates: [{
        content: {
          role: 'model',
          parts: [{ functionCall: { name: 'get_weather', args: { location: 'London' } } }],
        },
        finishReason: 'STOP',
        index: 0,
      }],
    }
    const response = geminiAdapter.fromProviderResponse(raw)
    expect(response.choices[0].message.toolCalls?.[0].function.name).toBe('get_weather')
    expect(JSON.parse(response.choices[0].message.toolCalls?.[0].function.arguments ?? '{}')).toEqual({ location: 'London' })
  })
})
