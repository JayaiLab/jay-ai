# @jay-ai/core

## 0.3.0

## 0.2.1

## 0.2.0

### Minor Changes

- 790197e: feat: add OpenAI Codex streaming provider with SSE and WebSocket support

## 0.1.0

### Minor Changes

- b14c215: In-session /login and /model commands with multi-provider OAuth

  - Support running /login and /model during a live chat session
  - Add OpenAI Codex OAuth provider with PKCE flow and local callback server
  - Store multiple provider credentials in auth.json with auto-migration
  - Filter model selection to only show authenticated providers
  - Fix cursor marker leaking as visible text, cursor visibility, and line wrapping

## 0.0.4

### Patch Changes

- bb50809: Add MIT license field to all packages

## 0.0.3

### Patch Changes

- f9569c8: Add engines field to require Node.js >= 20
