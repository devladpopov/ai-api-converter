# ai-api-converter

[![npm version](https://img.shields.io/npm/v/ai-api-converter.svg)](https://www.npmjs.com/package/ai-api-converter)
[![license](https://img.shields.io/npm/l/ai-api-converter.svg)](https://github.com/devladpopov/ai-api-converter/blob/master/LICENSE)
[![bundle size](https://img.shields.io/bundlephobia/minzip/ai-api-converter)](https://bundlephobia.com/package/ai-api-converter)
![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)

Convert between OpenAI, Anthropic, Gemini, and Ollama API formats with a single function call.

**Zero dependencies. Type-safe. Works everywhere: Node, Deno, Bun, Cloudflare Workers, browsers.**

```ts
import { toProviderRequest, fromProviderResponse, parseSSEStream } from 'ai-api-converter'

// Define your request once in universal format
const request = {
  model: 'gpt-4o',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello!' },
  ],
  tools: [{
    type: 'function',
    function: { name: 'get_weather', parameters: { type: 'object', properties: { city: { type: 'string' } } } },
  }],
  maxTokens: 1024,
}

// Convert to any provider format
const openaiBody = toProviderRequest(request, 'openai')     // { model, messages, tools, max_tokens, ... }
const anthropicBody = toProviderRequest(request, 'anthropic') // { model, messages, system, tools: [{ input_schema }], max_tokens, ... }
const geminiBody = toProviderRequest(request, 'gemini')       // { contents, systemInstruction, tools: [{ functionDeclarations }], ... }

// Parse responses back to universal format
const response = fromProviderResponse(rawApiResponse, 'anthropic')
console.log(response.choices[0].message.content)       // works the same regardless of provider
console.log(response.choices[0].message.toolCalls?.[0]) // normalized tool calls
```

## Why?

Every AI provider has a different API format. Switching between them or supporting multiple providers means rewriting request/response handling for each one. This library handles the conversion so you don't have to.

| Feature | ai-api-converter | LiteLLM | Vercel AI SDK |
|---------|:---:|:---:|:---:|
| Language | TypeScript | Python | TypeScript |
| Dependencies | 0 | 50+ | 20+ |
| Runtime | Any JS runtime | Python / proxy | Node + Next.js |
| Architecture | Pure functions | Gateway/proxy | Framework toolkit |
| Edge/browser | Yes | No | Partial |
| Bundle size | ~22 KB | N/A | ~200 KB+ |

## Install

```bash
npm install ai-api-converter
# or
bun add ai-api-converter
# or
pnpm add ai-api-converter
```

## What it converts

### Messages

| Universal | OpenAI | Anthropic | Gemini |
|-----------|--------|-----------|--------|
| `role: 'system'` | `messages[{role: 'system'}]` | Top-level `system` param | `systemInstruction` |
| `role: 'user'` | `messages[{role: 'user'}]` | `messages[{role: 'user'}]` | `contents[{role: 'user'}]` |
| `role: 'assistant'` | `messages[{role: 'assistant'}]` | `messages[{role: 'assistant'}]` | `contents[{role: 'model'}]` |
| `role: 'tool'` | `messages[{role: 'tool'}]` | User msg with `tool_result` block | User msg with `functionResponse` |

### Tool calling

| Universal | OpenAI | Anthropic | Gemini |
|-----------|--------|-----------|--------|
| `tools[].function.parameters` | `tools[].function.parameters` | `tools[].input_schema` | `tools[].functionDeclarations[].parameters` |
| `toolCalls[].function` | `tool_calls[].function` | `content[{type: 'tool_use'}]` | `parts[{functionCall}]` |
| `toolChoice: 'required'` | `tool_choice: 'required'` | `tool_choice: {type: 'any'}` | `toolConfig.mode: 'ANY'` |

### Parameters

| Universal | OpenAI | Anthropic | Gemini |
|-----------|--------|-----------|--------|
| `maxTokens` | `max_tokens` | `max_tokens` | `generationConfig.maxOutputTokens` |
| `temperature` | `temperature` | `temperature` | `generationConfig.temperature` |
| `topP` | `top_p` | `top_p` | `generationConfig.topP` |
| `stop` | `stop` | `stop_sequences` | `generationConfig.stopSequences` |

## Streaming

Parse SSE streams from any provider into a unified format:

```ts
import { toProviderRequest, parseSSEStream } from 'ai-api-converter'

const body = toProviderRequest(request, 'anthropic')
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'x-api-key': ANTHROPIC_KEY, 'content-type': 'application/json', 'anthropic-version': '2023-06-01' },
  body: JSON.stringify({ ...body, stream: true }),
})

for await (const chunk of parseSSEStream(response.body!, 'anthropic')) {
  const text = chunk.choices[0]?.delta?.content
  if (text) process.stdout.write(text)
}
```

Or collect the full text:

```ts
import { collectStreamText } from 'ai-api-converter'

const { text, chunks } = await collectStreamText(response.body!, 'openai')
console.log(text) // "Hello! How can I help you?"
```

## Embeddings

Convert between embedding API formats for OpenAI, Gemini, and Ollama:

```ts
import { toEmbeddingProviderRequest, fromEmbeddingProviderResponse } from 'ai-api-converter'

const request = { model: 'text-embedding-3-small', input: ['Hello', 'World'] }

const openaiBody = toEmbeddingProviderRequest(request, 'openai')
const geminiBody = toEmbeddingProviderRequest(request, 'gemini') // auto-batched
const ollamaBody = toEmbeddingProviderRequest(request, 'ollama')

// Parse responses back to universal format
const result = fromEmbeddingProviderResponse(rawResponse, 'openai')
console.log(result.embeddings[0].values) // number[]
```

> Note: Anthropic does not have a native embeddings API.

## Token counting

Approximate token counting, zero dependencies:

```ts
import { countTokens, countMessageTokens } from 'ai-api-converter'

countTokens('Hello world', 'openai')      // { tokens: 3, method: 'approximate' }
countTokens('Hello world', 'anthropic')   // { tokens: 4, method: 'approximate' }

countMessageTokens([
  { role: 'system', content: 'You are helpful.' },
  { role: 'user', content: 'Hi!' },
], 'openai') // { tokens: 16, method: 'approximate' }
```

## Compatibility table

| Feature | OpenAI | Anthropic | Gemini | Ollama |
|---------|:---:|:---:|:---:|:---:|
| Chat request/response | Yes | Yes | Yes | Yes |
| Streaming (SSE) | Yes | Yes | Yes | Yes* |
| Tool calling | Yes | Yes | Yes | Yes* |
| Vision / multimodal | Yes | Yes | Yes | - |
| System prompt | Yes | Yes | Yes | Yes |
| Embeddings | Yes | - | Yes | Yes |
| Token counting | Yes | Yes | Yes | Yes |

\* Ollama disables streaming when tools are present (known Ollama limitation).

## Adapter API

For lower-level control, use adapters directly:

```ts
import { openaiAdapter, createAnthropicAdapter, geminiAdapter, ollamaAdapter } from 'ai-api-converter'

// Each adapter has three methods:
const providerRequest = openaiAdapter.toProviderRequest(universalRequest)
const universalResponse = openaiAdapter.fromProviderResponse(rawResponse)
const streamChunk = openaiAdapter.fromProviderStreamChunk(rawChunk)

// Anthropic adapter is stateful (tracks streaming context), so create fresh instances:
const adapter = createAnthropicAdapter()
adapter.resetStreamState() // call between requests
```

## Type safety

All types are exported for full TypeScript integration:

```ts
import type {
  ChatRequest, ChatResponse, StreamChunk,
  Message, Tool, ToolCall, Provider,
  EmbeddingRequest, EmbeddingResponse,
  TokenCountProvider, TokenCountResult,
  // Provider-specific types
  OpenAIChatRequest, AnthropicChatRequest, GeminiChatRequest,
} from 'ai-api-converter'
```

## Edge cases handled

- **System prompt extraction**: Automatically moves system messages to the correct location for each provider
- **Adjacent message merging**: Anthropic requires alternating user/assistant; consecutive same-role messages are merged
- **Tool result wrapping**: Tool results are converted to provider-specific formats (Anthropic `tool_result` blocks, Gemini `functionResponse` parts)
- **Tool call ID resolution**: Gemini needs function names for responses; the adapter resolves these from conversation history
- **Default max_tokens**: Anthropic requires `max_tokens`; defaults to 4096 if not specified
- **Streaming quirks**: Ollama breaks streaming with tools enabled; the adapter automatically disables it
- **Vision/multimodal**: Base64 and URL images converted between OpenAI `image_url`, Anthropic `image` blocks, and Gemini `inlineData`/`fileData`
- **SSE buffer protection**: Stream parser enforces 1MB line buffer limit to prevent memory exhaustion
- **Prototype pollution protection**: `extra` field merge blocks `__proto__`, `constructor`, and `prototype` keys

## License

MIT
