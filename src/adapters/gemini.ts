import type {
  Adapter,
  ChatRequest,
  ChatResponse,
  StreamChunk,
  Message,
  ContentPart,
  AssistantMessage,
  ToolCall,
} from '../types/common.js'
import { mergeExtra } from '../utils/safe-merge.js'
import type {
  GeminiChatRequest,
  GeminiChatResponse,
  GeminiContent,
  GeminiPart,
  GeminiTextPart,
  GeminiTool,
  GeminiToolConfig,
  GeminiStreamChunk,
} from '../types/gemini.js'

// ─── To Provider ─────────────────────────────────────────

/**
 * Gemini uses "user" and "model" roles. No "system" or "tool" role in contents.
 * System prompt goes to systemInstruction. Tool results go as functionResponse parts in user messages.
 */
function convertMessages(messages: Message[]): {
  systemInstruction: { parts: GeminiTextPart[] } | undefined
  contents: GeminiContent[]
} {
  const systemParts: GeminiTextPart[] = []
  const contents: GeminiContent[] = []

  for (const msg of messages) {
    switch (msg.role) {
      case 'system':
        systemParts.push({ text: msg.content })
        break

      case 'user': {
        const parts = convertUserParts(msg.content)
        pushMerging(contents, { role: 'user', parts })
        break
      }

      case 'assistant': {
        const parts: GeminiPart[] = []
        if (msg.content) {
          parts.push({ text: msg.content })
        }
        if (msg.toolCalls?.length) {
          for (const tc of msg.toolCalls) {
            parts.push({
              functionCall: {
                name: tc.function.name,
                args: safeParseJson(tc.function.arguments),
              },
            })
          }
        }
        if (parts.length) {
          pushMerging(contents, { role: 'model', parts })
        }
        break
      }

      case 'tool': {
        const part: GeminiPart = {
          functionResponse: {
            name: findToolCallName(messages, msg.toolCallId),
            response: safeParseJsonOrWrap(msg.content),
          },
        }
        pushMerging(contents, { role: 'user', parts: [part] })
        break
      }
    }
  }

  return {
    systemInstruction: systemParts.length ? { parts: systemParts } : undefined,
    contents,
  }
}

function convertUserParts(content: string | ContentPart[]): GeminiPart[] {
  if (typeof content === 'string') return [{ text: content }]
  return content.map((part): GeminiPart => {
    if (part.type === 'text') return { text: part.text }
    return {
      inlineData: {
        mimeType: part.mediaType ?? 'image/png',
        data: part.data ?? '',
      },
    }
  })
}

function pushMerging(contents: GeminiContent[], item: GeminiContent): void {
  const last = contents[contents.length - 1]
  if (last && last.role === item.role) {
    last.parts.push(...item.parts)
  } else {
    contents.push(item)
  }
}

function convertToolConfig(tc: ChatRequest['toolChoice']): GeminiToolConfig | undefined {
  if (!tc) return undefined
  if (tc === 'auto') return { functionCallingConfig: { mode: 'AUTO' } }
  if (tc === 'none') return { functionCallingConfig: { mode: 'NONE' } }
  if (tc === 'required') return { functionCallingConfig: { mode: 'ANY' } }
  return {
    functionCallingConfig: {
      mode: 'ANY',
      allowedFunctionNames: [tc.function.name],
    },
  }
}

function findToolCallName(messages: Message[], toolCallId: string): string {
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.toolCalls) {
      const tc = msg.toolCalls.find((t) => t.id === toolCallId)
      if (tc) return tc.function.name
    }
  }
  return 'unknown'
}

function safeParseJson(str: string): Record<string, unknown> {
  try {
    return JSON.parse(str) as Record<string, unknown>
  } catch {
    return { _raw: str }
  }
}

function safeParseJsonOrWrap(str: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(str)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return { result: parsed }
  } catch {
    return { result: str }
  }
}

// ─── From Provider ───────────────────────────────────────

function convertCandidateMessage(content: GeminiContent): AssistantMessage {
  const textParts: string[] = []
  const toolCalls: ToolCall[] = []
  let callIndex = 0

  for (const part of content.parts) {
    if ('text' in part) {
      textParts.push(part.text)
    } else if ('functionCall' in part) {
      toolCalls.push({
        id: `call_${callIndex++}`,
        type: 'function',
        function: {
          name: part.functionCall.name,
          arguments: JSON.stringify(part.functionCall.args),
        },
      })
    }
  }

  return {
    role: 'assistant',
    content: textParts.length ? textParts.join('') : null,
    toolCalls: toolCalls.length ? toolCalls : undefined,
  }
}

function mapFinishReason(reason: string): string {
  const map: Record<string, string> = {
    STOP: 'stop',
    MAX_TOKENS: 'length',
    SAFETY: 'content_filter',
    RECITATION: 'content_filter',
  }
  return map[reason] ?? reason
}

// ─── ID generation ───────────────────────────────────────

let geminiIdCounter = 0

function nextGeminiId(): string {
  return `gemini-${Date.now()}-${geminiIdCounter++}`
}

// ─── Adapter ─────────────────────────────────────────────

export const geminiAdapter: Adapter = {
  provider: 'gemini',

  toProviderRequest(request: ChatRequest): GeminiChatRequest {
    const { systemInstruction, contents } = convertMessages(request.messages)

    const result: GeminiChatRequest = { contents }

    if (systemInstruction) result.systemInstruction = systemInstruction

    if (request.tools?.length) {
      const tool: GeminiTool = {
        functionDeclarations: request.tools.map((t) => ({
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        })),
      }
      result.tools = [tool]
    }

    const toolConfig = convertToolConfig(request.toolChoice)
    if (toolConfig) result.toolConfig = toolConfig

    const genConfig: GeminiChatRequest['generationConfig'] = {}
    let hasGenConfig = false

    if (request.temperature !== undefined) { genConfig.temperature = request.temperature; hasGenConfig = true }
    if (request.topP !== undefined) { genConfig.topP = request.topP; hasGenConfig = true }
    if (request.maxTokens !== undefined) { genConfig.maxOutputTokens = request.maxTokens; hasGenConfig = true }
    if (request.stop) {
      genConfig.stopSequences = Array.isArray(request.stop) ? request.stop : [request.stop]
      hasGenConfig = true
    }

    if (hasGenConfig) result.generationConfig = genConfig

    if (request.extra) {
      mergeExtra(result as Record<string, unknown>, request.extra)
    }

    return result
  },

  fromProviderResponse(raw: unknown): ChatResponse {
    const r = raw as GeminiChatResponse

    return {
      id: nextGeminiId(),
      model: r.modelVersion ?? 'gemini',
      choices: r.candidates.map((c) => ({
        index: c.index,
        message: convertCandidateMessage(c.content),
        finishReason: mapFinishReason(c.finishReason),
      })),
      usage: r.usageMetadata
        ? {
            promptTokens: r.usageMetadata.promptTokenCount,
            completionTokens: r.usageMetadata.candidatesTokenCount,
            totalTokens: r.usageMetadata.totalTokenCount,
          }
        : undefined,
    }
  },

  fromProviderStreamChunk(raw: unknown): StreamChunk | null {
    const r = raw as GeminiStreamChunk
    if (!r.candidates?.length) return null
    const candidate = r.candidates[0]
    if (!candidate.content?.parts?.length) return null

    const textParts: string[] = []
    const toolCalls: Partial<ToolCall>[] = []
    let callIndex = 0

    for (const part of candidate.content.parts) {
      if ('text' in part) {
        textParts.push(part.text)
      } else if ('functionCall' in part) {
        toolCalls.push({
          id: `call_${callIndex++}`,
          type: 'function',
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args),
          },
        })
      }
    }

    return {
      id: nextGeminiId(),
      model: r.modelVersion ?? 'gemini',
      choices: [{
        index: 0,
        delta: {
          content: textParts.length ? textParts.join('') : undefined,
          toolCalls: toolCalls.length ? toolCalls : undefined,
        },
        finishReason: candidate.finishReason ? mapFinishReason(candidate.finishReason) : null,
      }],
      usage: r.usageMetadata
        ? {
            promptTokens: r.usageMetadata.promptTokenCount,
            completionTokens: r.usageMetadata.candidatesTokenCount,
            totalTokens: r.usageMetadata.totalTokenCount,
          }
        : undefined,
    }
  },
}
