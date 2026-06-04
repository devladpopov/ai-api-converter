# AI Provider API Converter

Память проекта. Создан из Telegram-топика.

## Контекст создания
Дата: 2026-06-03
Группа: -1003894282745
Топик: 65086

## Исследование рынка (2026-06-03)

### Ключевые выводы

1. **Пустая ниша**: нет TypeScript-native, zero-dependency библиотеки для конвертации между AI API форматами
2. **Addressable market**: ~1-1.5M TS-разработчиков используют несколько AI-провайдеров
3. **Главные конкуренты**: LiteLLM (49K stars, Python), Vercel AI SDK (24.6K stars, framework-coupled)
4. **Позиционирование**: "LiteLLM for TypeScript, but as a library, not a server"
5. **Реалистичный потенциал**: 3-8K stars за первый год (optimistic: 15K+)

### Ключевые технические вызовы
- Tool calling: 4 разных формата (OpenAI/Anthropic/Gemini/Mistral)
- Streaming: разные SSE-форматы, Ollama ломает streaming с tools
- System prompts: message vs parameter vs config
- Token counting: каждый провайдер свой токенизатор
- Anthropic не имеет embeddings API

### MVP scope (1-2 недели)
- Request/response конвертация: OpenAI <-> Anthropic <-> Gemini <-> Ollama
- Tool calling schema translation
- Streaming support
- System prompt normalization
- Type-safe interfaces

### Монетизация (будущее)
- Phase 1: Open source MIT (adoption)
- Phase 2: Analytics dashboard ($29-49/month)
- Phase 3: Managed proxy service ($49-499/month)

### SEO фокус
- "litellm typescript alternative" (very low competition)
- "ai api adapter typescript" (very low competition)
- "openai to anthropic converter" (low competition)
