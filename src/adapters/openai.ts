import type {
  Adapter,
  ChatRequest,
  ChatResponse,
  StreamChunk,
  Message,
  ContentPart,
  ToolCall,
  AssistantMessage,
} from '../types/common.js'
import type {
  OpenAIChatRequest,
  OpenAIChatResponse,
  OpenAIStreamChunk,
  OpenAIMessage,
  OpenAIContentPart,
  OpenAITool,
  OpenAIToolChoice,
  OpenAIToolCall,
} from '../types/openai.js'

// ─── To Provider ─────────────────────────────────────────

function convertMessageToOpenAI(msg: Message): OpenAIMessage {
  switch (msg.role) {
    case 'system':
      return { role: 'system', content: msg.content }

    case 'user': {
      if (typeof msg.content === 'string') {
        return { role: 'user', content: msg.content }
      }
      return {
        role: 'user',
        content: msg.content.map(convertContentPartToOpenAI),
      }
    }

    case 'assistant': {
      const result: OpenAIMessage = {
        role: 'assistant',
        content: msg.content ?? null,
      }
      if (msg.toolCalls?.length) {
        result.tool_calls = msg.toolCalls.map(convertToolCallToOpenAI)
      }
      return result
    }

    case 'tool':
      return {
        role: 'tool',
        content: msg.content,
        tool_call_id: msg.toolCallId,
      }
  }
}

function convertContentPartToOpenAI(part: ContentPart): OpenAIContentPart {
  if (part.type === 'text') {
    return { type: 'text', text: part.text }
  }
  const url = part.url ?? `data:${part.mediaType ?? 'image/png'};base64,${part.data}`
  return { type: 'image_url', image_url: { url } }
}

function convertToolCallToOpenAI(tc: ToolCall): OpenAIToolCall {
  return {
    id: tc.id,
    type: 'function',
    function: { name: tc.function.name, arguments: tc.function.arguments },
  }
}

function convertToolChoiceToOpenAI(tc: ChatRequest['toolChoice']): OpenAIToolChoice | undefined {
  if (!tc) return undefined
  if (typeof tc === 'string') return tc
  return tc
}

// ─── From Provider ───────────────────────────────────────

function convertMessageFromOpenAI(msg: OpenAIMessage): AssistantMessage {
  const result: AssistantMessage = {
    role: 'assistant',
    content: typeof msg.content === 'string' ? msg.content : null,
  }
  if (msg.tool_calls?.length) {
    result.toolCalls = msg.tool_calls.map((tc) => ({
      id: tc.id,
      type: 'function' as const,
      function: { name: tc.function.name, arguments: tc.function.arguments },
    }))
  }
  return result
}

function mapFinishReason(reason: string): string {
  const map: Record<string, string> = {
    stop: 'stop',
    tool_calls: 'tool_calls',
    length: 'length',
    content_filter: 'content_filter',
  }
  return map[reason] ?? reason
}

// ─── Adapter ─────────────────────────────────────────────

export const openaiAdapter: Adapter = {
  provider: 'openai',

  toProviderRequest(request: ChatRequest): OpenAIChatRequest {
    const result: OpenAIChatRequest = {
      model: request.model,
      messages: request.messages.map(convertMessageToOpenAI),
    }

    if (request.tools?.length) {
      result.tools = request.tools.map((t): OpenAITool => ({
        type: 'function',
        function: {
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        },
      }))
    }

    const toolChoice = convertToolChoiceToOpenAI(request.toolChoice)
    if (toolChoice !== undefined) result.tool_choice = toolChoice

    if (request.maxTokens !== undefined) result.max_tokens = request.maxTokens
    if (request.temperature !== undefined) result.temperature = request.temperature
    if (request.topP !== undefined) result.top_p = request.topP
    if (request.stop !== undefined) result.stop = request.stop
    if (request.stream !== undefined) result.stream = request.stream

    if (request.extra) {
      Object.assign(result, request.extra)
    }

    return result
  },

  fromProviderResponse(raw: unknown): ChatResponse {
    const r = raw as OpenAIChatResponse
    return {
      id: r.id,
      model: r.model,
      choices: r.choices.map((c) => ({
        index: c.index,
        message: convertMessageFromOpenAI(c.message),
        finishReason: mapFinishReason(c.finish_reason),
      })),
      usage: r.usage
        ? {
            promptTokens: r.usage.prompt_tokens,
            completionTokens: r.usage.completion_tokens,
            totalTokens: r.usage.total_tokens,
          }
        : undefined,
    }
  },

  fromProviderStreamChunk(raw: unknown): StreamChunk | null {
    const r = raw as OpenAIStreamChunk
    if (!r.choices?.length) return null

    return {
      id: r.id,
      model: r.model,
      choices: r.choices.map((c) => ({
        index: c.index,
        delta: {
          role: c.delta.role as 'assistant' | undefined,
          content: typeof c.delta.content === 'string' ? c.delta.content : undefined,
          toolCalls: c.delta.tool_calls?.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: tc.function
              ? { name: tc.function.name, arguments: tc.function.arguments }
              : undefined,
          })),
        },
        finishReason: c.finish_reason ? mapFinishReason(c.finish_reason) : null,
      })),
      usage: r.usage
        ? {
            promptTokens: r.usage.prompt_tokens,
            completionTokens: r.usage.completion_tokens,
            totalTokens: r.usage.total_tokens,
          }
        : undefined,
    }
  },
}
