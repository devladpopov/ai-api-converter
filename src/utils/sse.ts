import type { StreamChunk, Provider } from '../types/common.js'
import { openaiAdapter } from '../adapters/openai.js'
import { createAnthropicAdapter } from '../adapters/anthropic.js'
import { geminiAdapter } from '../adapters/gemini.js'
import { ollamaAdapter } from '../adapters/ollama.js'
import type { Adapter } from '../types/common.js'

/** Maximum buffer size for a single SSE line (1 MB). Prevents OOM on malformed streams. */
const MAX_LINE_BUFFER = 1024 * 1024

/**
 * Parse a Server-Sent Events (SSE) stream from any provider and yield universal StreamChunks.
 *
 * Handles all provider SSE quirks:
 * - OpenAI/Ollama/Groq: `data: {...}\n\n` with `data: [DONE]` terminator
 * - Anthropic: `event: <type>\ndata: {...}\n\n` with typed events
 * - Gemini: SSE format when using `?alt=sse`
 *
 * @example
 * const response = await fetch('https://api.openai.com/v1/chat/completions', { ... })
 * for await (const chunk of parseSSEStream(response.body!, 'openai')) {
 *   process.stdout.write(chunk.choices[0]?.delta?.content ?? '')
 * }
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
  provider: Provider,
): AsyncGenerator<StreamChunk> {
  const adapter = provider === 'anthropic'
    ? createAnthropicAdapter()
    : getStaticAdapter(provider)

  const lines = readSSELines(stream)

  let eventType: string | null = null

  for await (const line of lines) {
    // Anthropic sends `event: <type>` before data lines
    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim()
      continue
    }

    if (!line.startsWith('data:')) continue

    const data = line.slice(5).trim()

    // OpenAI/Ollama terminator
    if (data === '[DONE]') return

    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch {
      continue
    }

    // For Anthropic, set the event type on parsed data (only if it's an object)
    if (provider === 'anthropic' && eventType && typeof parsed === 'object' && parsed !== null) {
      ;(parsed as Record<string, unknown>).type = eventType
      eventType = null
    }

    const chunk = adapter.fromProviderStreamChunk(parsed)
    if (chunk) yield chunk
  }
}

/**
 * Parse a Gemini streaming response (SSE format, used with `?alt=sse`).
 */
export async function* parseGeminiStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamChunk> {
  yield* parseSSEStream(stream, 'gemini')
}

/**
 * Convenience: read a stream to completion and collect all text content.
 */
export async function collectStreamText(
  stream: ReadableStream<Uint8Array>,
  provider: Provider,
): Promise<{ text: string; chunks: StreamChunk[] }> {
  const chunks: StreamChunk[] = []
  let text = ''

  for await (const chunk of parseSSEStream(stream, provider)) {
    chunks.push(chunk)
    const content = chunk.choices[0]?.delta?.content
    if (content) text += content
  }

  return { text, chunks }
}

// ─── Internal helpers ────────────────────────────────────

function getStaticAdapter(provider: Provider): Adapter {
  switch (provider) {
    case 'openai': return openaiAdapter
    case 'gemini': return geminiAdapter
    case 'ollama': return ollamaAdapter
    default:
      throw new Error(`Unknown provider: ${provider as string}`)
  }
}

/**
 * Read a ReadableStream<Uint8Array> and yield individual SSE lines.
 * Handles partial chunks and multi-byte UTF-8 correctly.
 * Throws if a single line exceeds MAX_LINE_BUFFER to prevent OOM.
 */
async function* readSSELines(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      if (buffer.length > MAX_LINE_BUFFER) {
        throw new Error(`SSE line exceeded maximum buffer size (${MAX_LINE_BUFFER} bytes)`)
      }

      const lines = buffer.split('\n')
      // Keep the last partial line in the buffer
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed) yield trimmed
      }
    }

    // Process any remaining data
    if (buffer.trim()) {
      yield buffer.trim()
    }
  } finally {
    reader.releaseLock()
  }
}
