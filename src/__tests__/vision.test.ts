import { describe, test, expect } from 'bun:test'
import { openaiAdapter } from '../adapters/openai.js'
import { anthropicAdapter } from '../adapters/anthropic.js'
import { geminiAdapter } from '../adapters/gemini.js'
import type { ChatRequest } from '../types/common.js'

const visionRequestBase64: ChatRequest = {
  model: 'gpt-4o',
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'What is in this image?' },
        { type: 'image', data: 'base64data', mediaType: 'image/png' },
      ],
    },
  ],
}

const visionRequestUrl: ChatRequest = {
  model: 'gpt-4o',
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Describe this' },
        { type: 'image', url: 'https://example.com/image.png', mediaType: 'image/jpeg' },
      ],
    },
  ],
}

describe('Vision: OpenAI adapter', () => {
  test('base64 image converts to data URL', () => {
    const result = openaiAdapter.toProviderRequest(visionRequestBase64) as {
      messages: { content: { type: string; image_url?: { url: string } }[] }[]
    }
    const content = result.messages[0].content
    expect(content[0].type).toBe('text')
    expect(content[1].type).toBe('image_url')
    expect(content[1].image_url?.url).toBe('data:image/png;base64,base64data')
  })

  test('URL image passes through', () => {
    const result = openaiAdapter.toProviderRequest(visionRequestUrl) as {
      messages: { content: { type: string; image_url?: { url: string } }[] }[]
    }
    const content = result.messages[0].content
    expect(content[1].image_url?.url).toBe('https://example.com/image.png')
  })
})

describe('Vision: Anthropic adapter', () => {
  test('base64 image converts to Anthropic format', () => {
    const result = anthropicAdapter.toProviderRequest(visionRequestBase64) as {
      messages: { content: { type: string; source?: { type: string; data?: string; media_type?: string } }[] }[]
    }
    const content = result.messages[0].content
    expect(content[0].type).toBe('text')
    expect(content[1].type).toBe('image')
    expect(content[1].source?.type).toBe('base64')
    expect(content[1].source?.data).toBe('base64data')
    expect(content[1].source?.media_type).toBe('image/png')
  })

  test('URL image converts to Anthropic URL format', () => {
    const result = anthropicAdapter.toProviderRequest(visionRequestUrl) as {
      messages: { content: { type: string; source?: { type: string; url?: string } }[] }[]
    }
    const content = result.messages[0].content
    expect(content[1].type).toBe('image')
    expect(content[1].source?.type).toBe('url')
    expect(content[1].source?.url).toBe('https://example.com/image.png')
  })
})

describe('Vision: Gemini adapter', () => {
  test('base64 image converts to inlineData', () => {
    const result = geminiAdapter.toProviderRequest(visionRequestBase64) as {
      contents: { parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] }[]
    }
    const parts = result.contents[0].parts
    expect(parts[0].text).toBe('What is in this image?')
    expect(parts[1].inlineData?.mimeType).toBe('image/png')
    expect(parts[1].inlineData?.data).toBe('base64data')
  })

  test('URL image converts to fileData', () => {
    const result = geminiAdapter.toProviderRequest(visionRequestUrl) as {
      contents: { parts: { text?: string; fileData?: { mimeType: string; fileUri: string } }[] }[]
    }
    const parts = result.contents[0].parts
    expect(parts[1].fileData?.fileUri).toBe('https://example.com/image.png')
    expect(parts[1].fileData?.mimeType).toBe('image/jpeg')
  })
})
