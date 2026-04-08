---
"@jay-ai/coding-agent": minor
"@jay-ai/tui": minor
---

Add interactive model selection, settings persistence, CLI error handling, and reusable select dropdown

- Add `jayai model` command with interactive dropdown to select LLM model/provider
- Store model selection in `~/.jayai/settings.json`
- Require authentication and model selection before starting chat
- Add proper error handling for LLM provider stream failures
- Add `/command` support during chat sessions (e.g., `/login`)
- Create dedicated CLI entry point with proxy support
- Extract reusable `selectFromOptions` utility to TUI package
- Replace number-based login provider selection with dropdown UI
- Show unknown command error instead of defaulting to chat
