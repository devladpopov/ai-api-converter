# AI Provider API Converter: Market Research

**Date:** 2026-06-03

---

## 1. Existing Libraries (Landscape)

### Tier 1: Major Players

| Library | Stars | Language | Approach | Providers | Weekly DL |
|---------|-------|----------|----------|-----------|-----------|
| LiteLLM | 49,200 | Python | SDK + Proxy Gateway | 100+ | N/A (pip) |
| Vercel AI SDK | 24,600 | TypeScript | Framework toolkit | 20+ | 20M npm |
| AISuite | 12,000 | Python | Lightweight unified | 8+ | N/A |
| Portkey Gateway | 11,500 | TypeScript | Enterprise gateway | 1,600+ | N/A |
| OpenRouter | N/A | Service | Managed proxy | 300+ models | N/A |
| Instructor | ~8,000 | Python+TS | Structured output | 15+ | N/A |

### Tier 2: Niche/Emerging

- **Mastra** (TS): 90+ providers, opinionated framework
- **Bifrost**: Ultra-low latency gateway (<15 microseconds), 15+ providers
- **Claude Adapter** / **Anthropic Adapter**: Direct OpenAI<->Anthropic converters (minimal stars)
- **LLM API Adapter** (Python): Unified interface, small project
- **Aidapter** (Python): Multiple providers, minimal adoption

### Key Finding: TypeScript Gap

**No dominant TypeScript-native, zero-dependency library exists for pure API format conversion.**

- Vercel AI SDK: closest, but framework-coupled (Next.js ecosystem), not zero-dep
- Portkey: enterprise gateway, not a library for individual devs
- Everything else: Python-first or service-based

---

## 2. Tool Calling: Format Differences

### OpenAI Function Calling
```json
{
  "type": "function",
  "function": {
    "name": "get_weather",
    "description": "...",
    "parameters": { "type": "object", "properties": {...} }
  }
}
```

### Anthropic Tool Use
```json
{
  "name": "get_weather",
  "description": "...",
  "input_schema": { "type": "object", "properties": {...} }
}
```

### Google Gemini Function Declarations
- FunctionDeclaration objects wrapped in Tool object
- Different property names and nesting
- Protocol Buffer-style type definitions

### Mistral
- Nearly identical to OpenAI format
- Supports `parallel_tool_calls` parameter

### Response Formats

| Provider | Tool call in response | Tool result submission |
|----------|----------------------|----------------------|
| OpenAI | `tool_calls` array in assistant message | `role: "tool"` message with `tool_call_id` |
| Anthropic | `content` block with `type: "tool_use"` | `role: "user"` with `type: "tool_result"` |
| Gemini | `functionCall` in parts | `functionResponse` in parts |

### Reliability (Q1 2026)
- Anthropic: 8.4/10
- Gemini: 7.9/10
- OpenAI: 6.3/10

### Who Converts Correctly?
- LiteLLM: Full translation (Python only)
- Vercel AI SDK: Unified tool definition with provider adapters
- Instructor: Automatic schema conversion
- **No lightweight TS library does this standalone**

---

## 3. "OpenAI-Compatible" Endpoints: Reality

### Ollama (~95% compatible)
- Tool calling works but **breaks streaming** (stream=True returns single response)
- Vision works with multimodal models via base64
- Ignores: logprobs, n parameters
- No fine-tuned model IDs

### Groq (highly compatible)
- Full tool calling with parallel function calling
- Full streaming protocol compatibility
- tool_choice: "none", "auto", "required"

### Together AI (mostly compatible)
- Uses `<provider>/<model_name>` naming convention
- logprobs returns proprietary shape
- n parameter not supported on every model
- Batch API, Files API not implemented

### Verdict
"OpenAI-compatible" is marketing. An abstraction layer is essential, not optional.

---

## 4. Market: Multi-Provider Usage

### Key Statistics
- **59% of developers** run 3+ AI tools in parallel (Stack Overflow 2025)
- **84% of developers** use or plan to use AI tools
- **81%** use OpenAI chat models; **45%** use Anthropic Claude
- TypeScript: **#1 language on GitHub** since August 2025 (2.6M+ monthly contributors)

### Why Multiple Providers?

| Reason | Detail |
|--------|--------|
| Capability routing | Claude for code/reasoning, GPT for general, Gemini for multimodal |
| Cost optimization | Token pricing varies 10-50x across providers |
| Fallback/reliability | Provider outages frequent; production needs failover |
| Vendor lock-in avoidance | Ability to swap without rewriting |
| Compliance/data residency | Some providers offer guarantees others don't |

### Addressable Market
~1-1.5M TypeScript developers who use multiple AI providers.

---

## 5. Technical Challenges

### Streaming
- All providers use SSE, but:
  - OpenAI: delta chunks, declares function calls upfront
  - Anthropic: adds `event:` line, longer content blocks, tool calls mixed with text
  - JSON streaming: O(n^2) parsing for incomplete chunks
  - Ollama: breaks streaming when tools enabled on /v1 endpoint

### Vision
- Claude: base64 or URLs, up to 20 images, ~5MB each
- OpenAI: URL or base64 data URLs, detail parameter (low=85 tokens vs high)
- Gemini: base64 or file reading, 20MB total request limit

### System Prompts
- OpenAI: `role: "system"` message
- Anthropic: `system` parameter (top-level, not in messages)
- Gemini: `systemInstruction` in generation config

### Token Counting
- Each provider uses own tokenizer (same text = different token counts)
- OpenAI: tiktoken (open-source, exact)
- Anthropic: closed tokenizer, only count_tokens endpoint is authoritative
- Gemini: closed, countTokens endpoint
- Third-party estimators: +/-5-10% accuracy

### Embeddings
- OpenAI: text-embedding-3-large/small
- Anthropic: **NO native embeddings** (points to Voyage AI)
- Gemini: gemini-embedding-2-preview (multimodal)

### Structured Output
- OpenAI: output_config.format with JSON schema (constrained decoding)
- Anthropic: tool_use pattern with tool choice
- Gemini: response_schema in generation config (constrained decoding)
- 82% of models (199/244 tested) pass structured output

---

## 6. Positioning Strategy

### The Gap in the Market

Two extremes exist, nothing in between:
1. **Heavy gateways** (LiteLLM proxy, Portkey, OpenRouter): require infrastructure, add latency
2. **Full frameworks** (Vercel AI SDK): tied to ecosystems, opinionated

### Our Position: Pure Conversion Library

| Dimension | LiteLLM | Vercel AI SDK | **Our Library** |
|-----------|---------|---------------|-----------------|
| Language | Python | TypeScript | TypeScript |
| Runtime | Python process / proxy | Node + Next.js | Any JS runtime |
| Dependencies | Heavy (FastAPI, PostgreSQL, Redis) | Framework-coupled | **Zero** |
| Type safety | Python hints (runtime) | Partial | **Full generics (compile-time)** |
| Architecture | Gateway/proxy | Framework toolkit | **Pure function adapters** |
| Edge/browser | No | Partial | **Yes** |
| Scope | Everything + kitchen sink | Full-stack AI apps | **Focused: format conversion** |

### Key Differentiators
1. **TypeScript-native** (not a port, not a wrapper)
2. **Zero dependencies** (no supply chain risk, works in Node/Deno/Bun/edge/browser)
3. **Pure functions** (no proxy, no server, no infra)
4. **Compile-time type safety** (catch format errors before runtime)
5. **Focused scope** (does one thing perfectly)

### Positioning Statement
"LiteLLM for TypeScript, but as a library, not a server."

---

## 7. Monetization Path

### Phase 1: Open Source Core (Adoption)
- Free MIT library on npm/GitHub
- Pure format conversion
- Goal: 3-8K stars in first year

### Phase 2: Premium Add-ons ($29-49/month)
- Analytics/observability dashboard (token usage, costs, latency)
- Cost optimization engine (automatic routing recommendations)
- Semantic caching layer

### Phase 3: Managed Service ($49-499/month)
- Hosted proxy with TS-native performance
- Enterprise: SSO, RBAC, team budgets, audit logs

### Market Reference Points
- OpenRouter: 5.5% token markup, millions ARR
- Portkey: $49-499/month tiers
- LiteLLM Enterprise: custom pricing for SSO/RBAC
- AI infrastructure: 48% of all dev tool investment in 2024

---

## 8. SEO Strategy

### Primary Keywords (Long-tail, Low Competition)

| Keyword | Est. Monthly Volume | Competition |
|---------|-------------------|-------------|
| "litellm typescript alternative" | 100-500 | Very Low |
| "ai api adapter typescript" | 50-200 | Very Low |
| "openai to anthropic converter" | 200-800 | Low |
| "multi provider llm typescript" | 50-200 | Very Low |
| "switch between ai providers" | 300-1,000 | Low-Medium |
| "universal ai sdk" | 500-1,500 | Medium |
| "openai compatible api" | 5,000-12,000 | High |

### Content Strategy
- "Migrating from OpenAI to Anthropic in 5 minutes"
- "LiteLLM vs [our tool]: TypeScript comparison"
- "Tool calling across AI providers: the compatibility nightmare"
- Integration guides for Next.js, Express, Deno, Bun, Cloudflare Workers

---

## 9. Star Potential & Launch Strategy

### Realistic Projections

| Timeframe | Conservative | Optimistic |
|-----------|-------------|-----------|
| Month 1 | 50-200 | 500+ |
| Month 3 | 300-800 | 2,000+ |
| Month 6 | 1,000-3,000 | 5,000+ |
| Year 1 | 3,000-8,000 | 15,000+ |

### Launch Channels
1. Show HN post (day 1, can generate 200-500 stars)
2. r/typescript, r/node, r/javascript
3. Twitter/X: AI dev community
4. Dev.to / Medium blog posts
5. Newsletter features (TypeScript Weekly, Node Weekly)

### Adoption Drivers
1. Excellent README with before/after code snippets
2. Zero-config DX (`npm install` and done)
3. Type safety demos (autocomplete catching errors)
4. Provider coverage (minimum: OpenAI, Anthropic, Gemini, Mistral, Ollama)
5. Integration examples for every runtime

---

## 10. Risks

| Risk | Probability | Mitigation |
|------|------------|-----------|
| Vercel adds pure format conversion | Low (their incentive is gateway) | Move fast, establish community |
| LiteLLM releases TS SDK | Low (haven't in 2+ years) | Focus on zero-dep, type-safe angle |
| APIs converge on OpenAI format | Medium (Anthropic has compat layer) | Provide value beyond format conversion |
| Constant maintenance burden | High | Automated testing against live APIs |
| Provider API breaking changes | High | Versioned adapters, semver |

---

## 11. Recommended MVP Scope

**Ship in 1-2 weeks:**

1. Request conversion: OpenAI <-> Anthropic <-> Gemini <-> Ollama
2. Response conversion (including streaming)
3. Tool calling schema translation (all 4 providers)
4. System prompt normalization
5. Type-safe interfaces with full autocompletion

**Defer to v2:**
- Vision/multimodal
- Embeddings
- Token counting
- Structured output
- Cost calculation
- Caching

---

## Sources

- Stack Overflow Developer Survey 2025
- GitHub Octoverse 2025
- LiteLLM GitHub & Docs (github.com/BerriAI/litellm)
- Vercel AI SDK GitHub & Docs (ai-sdk.dev)
- Portkey AI Gateway (portkey.ai)
- OpenRouter Docs (openrouter.ai)
- AISuite GitHub (github.com/andrewyng/aisuite)
- Ollama OpenAI Compatibility Docs
- Groq API Docs
- Together AI OpenAI Compatibility Docs
- TrueFoundry LiteLLM Review 2026
- Maxim: Best LLM Router Solutions 2026
- Anthropic, OpenAI, Google official API docs
