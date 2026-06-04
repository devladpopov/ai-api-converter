/**
 * Universal (canonical) message format.
 * All provider-specific formats convert to/from this.
 * Intentionally close to OpenAI's format (de facto standard),
 * but with explicit types for provider-agnostic use.
 */

// ─── Roles ───────────────────────────────────────────────

export type Role = 'system' | 'user' | 'assistant' | 'tool'

// ─── Content parts (multimodal) ──────────────────────────

export interface TextPart {
  type: 'text'
  text: string
}

export interface ImagePart {
  type: 'image'
  /** Base64-encoded image data */
  data?: string
  /** Image URL */
  url?: string
  /** MIME type, e.g. "image/png" */
  mediaType?: string
}

export type ContentPart = TextPart | ImagePart

// ─── Tool definitions ────────────────────────────────────

export interface ToolFunction {
  name: string
  description?: string
  parameters?: JsonSchema
}

export interface Tool {
  type: 'function'
  function: ToolFunction
}

/** JSON Schema subset used in tool parameters */
export interface JsonSchema {
  type?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  description?: string
  enum?: unknown[]
  items?: JsonSchema
  anyOf?: JsonSchema[]
  oneOf?: JsonSchema[]
  allOf?: JsonSchema[]
  [key: string]: unknown
}

// ─── Tool calls (assistant requesting tool execution) ────

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

// ─── Tool results (user providing tool output) ───────────

export interface ToolResult {
  toolCallId: string
  content: string
  isError?: boolean
}

// ─── Messages ────────────────────────────────────────────

export interface SystemMessage {
  role: 'system'
  content: string
}

export interface UserMessage {
  role: 'user'
  content: string | ContentPart[]
}

export interface AssistantMessage {
  role: 'assistant'
  content?: string | null
  toolCalls?: ToolCall[]
}

export interface ToolMessage {
  role: 'tool'
  content: string
  toolCallId: string
}

export type Message = SystemMessage | UserMessage | AssistantMessage | ToolMessage

// ─── Request ─────────────────────────────────────────────

export type ToolChoice = 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } }

export interface ChatRequest {
  model: string
  messages: Message[]
  tools?: Tool[]
  toolChoice?: ToolChoice
  maxTokens?: number
  temperature?: number
  topP?: number
  stop?: string | string[]
  stream?: boolean
  /** Provider-specific options passed through as-is */
  extra?: Record<string, unknown>
}

// ─── Response ────────────────────────────────────────────

export interface Usage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface Choice {
  index: number
  message: AssistantMessage
  finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter' | string
}

export interface ChatResponse {
  id: string
  model: string
  choices: Choice[]
  usage?: Usage
}

// ─── Streaming ───────────────────────────────────────────

export interface StreamDelta {
  role?: 'assistant'
  content?: string
  toolCalls?: Partial<ToolCall>[]
}

export interface StreamChunk {
  id: string
  model: string
  choices: {
    index: number
    delta: StreamDelta
    finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter' | string | null
  }[]
  usage?: Usage
}

// ─── Adapter interface ───────────────────────────────────

export type Provider = 'openai' | 'anthropic' | 'gemini' | 'ollama'

export interface Adapter {
  provider: Provider

  /** Convert universal request to provider-specific format */
  toProviderRequest(request: ChatRequest): unknown

  /** Convert provider-specific response to universal format */
  fromProviderResponse(raw: unknown): ChatResponse

  /** Convert provider-specific stream chunk to universal format */
  fromProviderStreamChunk(raw: unknown): StreamChunk | null
}
