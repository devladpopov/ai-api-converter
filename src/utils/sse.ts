import type { StreamChunk, Provider } from '../types/common.js'
import { openaiAdapter } from '../adapters/openai.js'
import { createAnthropicAdapter } from '../adapters/anthropic.js'
import { geminiAdapter } from '../adapters/gemini.js'
import { ollamaAdapter } from '../adapters/ollama.js'
import type { Adapter } from '../types/common.js'

/**
 * Parse a Server-Sent Events (SSE) stream from any provider and yield universal StreamChunks.
 *
 * Handles all provider SSE quirks:
 * - OpenAI/Ollama/Groq: `data: {...}\n\n` with `data: [DONE]` terminator
 * - Anthropic: `event: <type>\ndata: {...}\n\n` with typed events
 * - Gemini: JSON array chunks or SSE depending on endpoint
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

    // For Anthropic, wrap parsed data with the event type
    if (provider === 'anthropic' && eventType) {
      ;(parsed as Record<string, unknown>).type = eventType
      eventType = null
    }

    const chunk = adapter.fromProviderStreamChunk(parsed)
    if (chunk) yield chunk
  }
}

/**
 * Parse a Gemini streaming response.
 * Gemini's REST streaming returns JSON array chunks, not standard SSE.
 * When using `?alt=sse`, it returns standard SSE format.
 *
 * This function handles both formats.
 */
export async function* parseGeminiStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamChunk> {
  // Try SSE format first (used with ?alt=sse)
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
    default: return openaiAdapter
  }
}

/**
 * Read a ReadableStream<Uint8Array> and yield individual SSE lines.
 * Handles partial chunks and multi-byte UTF-8 correctly.
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
