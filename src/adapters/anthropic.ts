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
  AnthropicChatRequest,
  AnthropicChatResponse,
  AnthropicMessage,
  AnthropicContentBlock,
  AnthropicTool,
  AnthropicToolChoice,
  AnthropicStreamEvent,
} from '../types/anthropic.js'

// ─── To Provider ─────────────────────────────────────────

/**
 * Anthropic has no "system" role in messages. System prompt goes to top-level `system` field.
 * Anthropic has no "tool" role. Tool results are sent as user messages with tool_result blocks.
 * Adjacent same-role messages must be merged (Anthropic requires alternating user/assistant).
 */
function convertMessages(messages: Message[]): {
  system: string | undefined
  messages: AnthropicMessage[]
} {
  let system: string | undefined
  const result: AnthropicMessage[] = []

  for (const msg of messages) {
    switch (msg.role) {
      case 'system':
        system = system ? `${system}\n\n${msg.content}` : msg.content
        break

      case 'user': {
        const content = convertUserContent(msg.content)
        pushMerging(result, { role: 'user', content })
        break
      }

      case 'assistant': {
        const blocks: AnthropicContentBlock[] = []
        if (msg.content) {
          blocks.push({ type: 'text', text: msg.content })
        }
        if (msg.toolCalls?.length) {
          for (const tc of msg.toolCalls) {
            blocks.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input: safeParseJson(tc.function.arguments),
            })
          }
        }
        if (blocks.length) {
          pushMerging(result, { role: 'assistant', content: blocks })
        }
        break
      }

      case 'tool': {
        const block: AnthropicContentBlock = {
          type: 'tool_result',
          tool_use_id: msg.toolCallId,
          content: msg.content,
        }
        pushMerging(result, { role: 'user', content: [block] })
        break
      }
    }
  }

  return { system, messages: result }
}

function convertUserContent(content: string | ContentPart[]): string | AnthropicContentBlock[] {
  if (typeof content === 'string') return content
  return content.map((part): AnthropicContentBlock => {
    if (part.type === 'text') {
      return { type: 'text', text: part.text }
    }
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: part.mediaType ?? 'image/png',
        data: part.data ?? '',
      },
    }
  })
}

/** Merge adjacent same-role messages by combining their content blocks */
function pushMerging(messages: AnthropicMessage[], msg: AnthropicMessage): void {
  const last = messages[messages.length - 1]
  if (last && last.role === msg.role) {
    const lastBlocks = typeof last.content === 'string'
      ? [{ type: 'text' as const, text: last.content }]
      : last.content
    const newBlocks = typeof msg.content === 'string'
      ? [{ type: 'text' as const, text: msg.content }]
      : msg.content
    last.content = [...lastBlocks, ...newBlocks]
  } else {
    messages.push(msg)
  }
}

function convertToolChoice(tc: ChatRequest['toolChoice']): AnthropicToolChoice | undefined {
  if (!tc) return undefined
  if (tc === 'auto') return { type: 'auto' }
  if (tc === 'none') return { type: 'none' }
  if (tc === 'required') return { type: 'any' }
  return { type: 'tool', name: tc.function.name }
}

function safeParseJson(str: string): Record<string, unknown> {
  try {
    return JSON.parse(str) as Record<string, unknown>
  } catch {
    return { _raw: str }
  }
}

// ─── From Provider ───────────────────────────────────────

function convertResponseContent(blocks: AnthropicContentBlock[]): AssistantMessage {
  const textParts: string[] = []
  const toolCalls: ToolCall[] = []

  for (const block of blocks) {
    if (block.type === 'text') {
      textParts.push(block.text)
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input),
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

function mapStopReason(reason: string | null): string {
  if (!reason) return 'stop'
  const map: Record<string, string> = {
    end_turn: 'stop',
    tool_use: 'tool_calls',
    max_tokens: 'length',
    stop_sequence: 'stop',
  }
  return map[reason] ?? reason
}

// ─── Streaming state ─────────────────────────────────────

interface StreamState {
  id: string
  model: string
  currentBlockIndex: number
  currentToolCallId?: string
  currentToolCallName?: string
  toolCallJsonBuffer: string
}

function createStreamState(): StreamState {
  return {
    id: '',
    model: '',
    currentBlockIndex: -1,
    toolCallJsonBuffer: '',
  }
}

// ─── Adapter ─────────────────────────────────────────────

export function createAnthropicAdapter(): Adapter & {
  /** Reset streaming state between requests */
  resetStreamState(): void
} {
  let streamState = createStreamState()

  return {
    provider: 'anthropic',

    resetStreamState() {
      streamState = createStreamState()
    },

    toProviderRequest(request: ChatRequest): AnthropicChatRequest {
      const { system, messages } = convertMessages(request.messages)

      const result: AnthropicChatRequest = {
        model: request.model,
        messages,
        max_tokens: request.maxTokens ?? 4096,
      }

      if (system) result.system = system

      if (request.tools?.length) {
        result.tools = request.tools.map((t): AnthropicTool => ({
          name: t.function.name,
          description: t.function.description,
          input_schema: t.function.parameters ?? { type: 'object', properties: {} },
        }))
      }

      const toolChoice = convertToolChoice(request.toolChoice)
      if (toolChoice) result.tool_choice = toolChoice

      if (request.temperature !== undefined) result.temperature = request.temperature
      if (request.topP !== undefined) result.top_p = request.topP
      if (request.stop) {
        result.stop_sequences = Array.isArray(request.stop) ? request.stop : [request.stop]
      }
      if (request.stream !== undefined) result.stream = request.stream

      if (request.extra) {
        mergeExtra(result as Record<string, unknown>, request.extra)
      }

      return result
    },

    fromProviderResponse(raw: unknown): ChatResponse {
      const r = raw as AnthropicChatResponse
      const message = convertResponseContent(r.content)

      return {
        id: r.id,
        model: r.model,
        choices: [{
          index: 0,
          message,
          finishReason: mapStopReason(r.stop_reason),
        }],
        usage: {
          promptTokens: r.usage.input_tokens,
          completionTokens: r.usage.output_tokens,
          totalTokens: r.usage.input_tokens + r.usage.output_tokens,
        },
      }
    },

    fromProviderStreamChunk(raw: unknown): StreamChunk | null {
      const event = raw as AnthropicStreamEvent

      switch (event.type) {
        case 'message_start': {
          streamState.id = event.message.id
          streamState.model = event.message.model
          return null
        }

        case 'content_block_start': {
          streamState.currentBlockIndex = event.index
          if (event.content_block.type === 'tool_use') {
            streamState.currentToolCallId = event.content_block.id
            streamState.currentToolCallName = event.content_block.name
            streamState.toolCallJsonBuffer = ''
            return {
              id: streamState.id,
              model: streamState.model,
              choices: [{
                index: 0,
                delta: {
                  toolCalls: [{
                    id: event.content_block.id,
                    type: 'function',
                    function: { name: event.content_block.name, arguments: '' },
                  }],
                },
                finishReason: null,
              }],
            }
          }
          return null
        }

        case 'content_block_delta': {
          if (event.delta.type === 'text_delta') {
            return {
              id: streamState.id,
              model: streamState.model,
              choices: [{
                index: 0,
                delta: { content: event.delta.text },
                finishReason: null,
              }],
            }
          }
          if (event.delta.type === 'input_json_delta') {
            streamState.toolCallJsonBuffer += event.delta.partial_json
            return {
              id: streamState.id,
              model: streamState.model,
              choices: [{
                index: 0,
                delta: {
                  toolCalls: [{
                    function: { name: '', arguments: event.delta.partial_json },
                  }],
                },
                finishReason: null,
              }],
            }
          }
          return null
        }

        case 'content_block_stop': {
          streamState.currentToolCallId = undefined
          streamState.currentToolCallName = undefined
          streamState.toolCallJsonBuffer = ''
          return null
        }

        case 'message_delta': {
          return {
            id: streamState.id,
            model: streamState.model,
            choices: [{
              index: 0,
              delta: {},
              finishReason: mapStopReason(event.delta.stop_reason),
            }],
            usage: event.usage
              ? {
                  promptTokens: 0,
                  completionTokens: event.usage.output_tokens,
                  totalTokens: event.usage.output_tokens,
                }
              : undefined,
          }
        }

        case 'message_stop':
          return null

        default:
          return null
      }
    },
  }
}

export const anthropicAdapter = createAnthropicAdapter()
