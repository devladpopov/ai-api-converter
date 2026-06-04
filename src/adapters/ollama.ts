import type {
  Adapter,
  ChatRequest,
  ChatResponse,
  StreamChunk,
} from '../types/common.js'
import { openaiAdapter } from './openai.js'

/**
 * Ollama adapter.
 *
 * Ollama's /v1/chat/completions endpoint is ~95% OpenAI-compatible.
 * Key differences:
 * - Uses "max_tokens" (not "max_completion_tokens")
 * - Tool calling + streaming don't work together (stream=true with tools returns single response)
 * - No logprobs, no "n" parameter
 * - Model names are local (e.g., "llama3.1", "mistral")
 *
 * This adapter delegates to OpenAI adapter and patches the quirks.
 */
export const ollamaAdapter: Adapter = {
  provider: 'ollama',

  toProviderRequest(request: ChatRequest): unknown {
    const openaiRequest = openaiAdapter.toProviderRequest(request) as Record<string, unknown>

    // When tools are present, disable streaming (Ollama breaks it)
    if (request.tools?.length && request.stream) {
      openaiRequest.stream = false
    }

    return openaiRequest
  },

  fromProviderResponse(raw: unknown): ChatResponse {
    return openaiAdapter.fromProviderResponse(raw)
  },

  fromProviderStreamChunk(raw: unknown): StreamChunk | null {
    return openaiAdapter.fromProviderStreamChunk(raw)
  },
}
