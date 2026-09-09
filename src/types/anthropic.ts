/**
 * Anthropic Messages API types.
 * Reference: https://docs.anthropic.com/en/api/messages
 */

export interface AnthropicTextBlock {
  type: 'text'
  text: string
}

export interface AnthropicImageBlockBase64 {
  type: 'image'
  source: {
    type: 'base64'
    media_type: string
    data: string
  }
}

export interface AnthropicImageBlockUrl {
  type: 'image'
  source: {
    type: 'url'
    url: string
  }
}

export type AnthropicImageBlock = AnthropicImageBlockBase64 | AnthropicImageBlockUrl

export interface AnthropicToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

export interface AnthropicToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string | AnthropicTextBlock[]
  is_error?: boolean
}

export type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicImageBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock

export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

export interface AnthropicTool {
  name: string
  description?: string
  input_schema: Record<string, unknown>
}

export type AnthropicToolChoice =
  | { type: 'auto' }
  | { type: 'any' }
  | { type: 'tool'; name: string }
  | { type: 'none' }

export interface AnthropicChatRequest {
  model: string
  messages: AnthropicMessage[]
  system?: string | AnthropicTextBlock[]
  tools?: AnthropicTool[]
  tool_choice?: AnthropicToolChoice
  max_tokens: number
  temperature?: number
  top_p?: number
  stop_sequences?: string[]
  stream?: boolean
  [key: string]: unknown
}

export interface AnthropicChatResponse {
  id: string
  type: 'message'
  role: 'assistant'
  content: AnthropicContentBlock[]
  model: string
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | string | null
  usage: {
    input_tokens: number
    output_tokens: number
  }
}

// ─── Streaming events ────────────────────────────────────

export interface AnthropicStreamMessageStart {
  type: 'message_start'
  message: AnthropicChatResponse
}

export interface AnthropicStreamContentBlockStart {
  type: 'content_block_start'
  index: number
  content_block: AnthropicContentBlock
}

export interface AnthropicStreamContentBlockDelta {
  type: 'content_block_delta'
  index: number
  delta:
    | { type: 'text_delta'; text: string }
    | { type: 'input_json_delta'; partial_json: string }
}

export interface AnthropicStreamContentBlockStop {
  type: 'content_block_stop'
  index: number
}

export interface AnthropicStreamMessageDelta {
  type: 'message_delta'
  delta: {
    stop_reason: string | null
  }
  usage?: {
    output_tokens: number
  }
}

export interface AnthropicStreamMessageStop {
  type: 'message_stop'
}

export type AnthropicStreamEvent =
  | AnthropicStreamMessageStart
  | AnthropicStreamContentBlockStart
  | AnthropicStreamContentBlockDelta
  | AnthropicStreamContentBlockStop
  | AnthropicStreamMessageDelta
  | AnthropicStreamMessageStop
