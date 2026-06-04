/**
 * Google Gemini API types.
 * Reference: https://ai.google.dev/api/generate-content
 */

export interface GeminiTextPart {
  text: string
}

export interface GeminiInlineDataPart {
  inlineData: {
    mimeType: string
    data: string
  }
}

export interface GeminiFunctionCallPart {
  functionCall: {
    name: string
    args: Record<string, unknown>
  }
}

export interface GeminiFunctionResponsePart {
  functionResponse: {
    name: string
    response: Record<string, unknown>
  }
}

export type GeminiPart =
  | GeminiTextPart
  | GeminiInlineDataPart
  | GeminiFunctionCallPart
  | GeminiFunctionResponsePart

export interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

export interface GeminiFunctionDeclaration {
  name: string
  description?: string
  parameters?: Record<string, unknown>
}

export interface GeminiTool {
  functionDeclarations: GeminiFunctionDeclaration[]
}

export interface GeminiToolConfig {
  functionCallingConfig: {
    mode: 'AUTO' | 'NONE' | 'ANY'
    allowedFunctionNames?: string[]
  }
}

export interface GeminiGenerationConfig {
  temperature?: number
  topP?: number
  maxOutputTokens?: number
  stopSequences?: string[]
}

export interface GeminiChatRequest {
  contents: GeminiContent[]
  systemInstruction?: { parts: GeminiTextPart[] }
  tools?: GeminiTool[]
  toolConfig?: GeminiToolConfig
  generationConfig?: GeminiGenerationConfig
  [key: string]: unknown
}

export interface GeminiCandidate {
  content: GeminiContent
  finishReason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER' | string
  index: number
}

export interface GeminiChatResponse {
  candidates: GeminiCandidate[]
  usageMetadata?: {
    promptTokenCount: number
    candidatesTokenCount: number
    totalTokenCount: number
  }
  modelVersion?: string
}

export type GeminiStreamChunk = GeminiChatResponse
