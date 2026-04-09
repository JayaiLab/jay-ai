---
"@jay-ai/core": minor
"@jay-ai/agent": minor
"@jay-ai/tui": minor
"@jay-ai/coding-agent": minor
---

In-session /login and /model commands with multi-provider OAuth

- Support running /login and /model during a live chat session
- Add OpenAI Codex OAuth provider with PKCE flow and local callback server
- Store multiple provider credentials in auth.json with auto-migration
- Filter model selection to only show authenticated providers
- Fix cursor marker leaking as visible text, cursor visibility, and line wrapping
