# @jay-ai/coding-agent

## 0.1.0

### Minor Changes

- b14c215: In-session /login and /model commands with multi-provider OAuth

  - Support running /login and /model during a live chat session
  - Add OpenAI Codex OAuth provider with PKCE flow and local callback server
  - Store multiple provider credentials in auth.json with auto-migration
  - Filter model selection to only show authenticated providers
  - Fix cursor marker leaking as visible text, cursor visibility, and line wrapping

### Patch Changes

- Updated dependencies [b14c215]
  - @jay-ai/core@0.1.0
  - @jay-ai/agent@0.1.0
  - @jay-ai/tui@0.1.0

## 0.0.4

### Patch Changes

- bb50809: Add MIT license field to all packages
- Updated dependencies [bb50809]
  - @jay-ai/agent@0.0.4
  - @jay-ai/core@0.0.4
  - @jay-ai/tui@0.0.4

## 0.0.3

### Patch Changes

- f9569c8: Add engines field to require Node.js >= 20
- Updated dependencies [f9569c8]
  - @jay-ai/agent@0.0.3
  - @jay-ai/core@0.0.3
  - @jay-ai/tui@0.0.3

## 0.0.2

### Patch Changes

- 54bc8c7: Fix missing shebang in CLI binary — `jayai` command now runs correctly after global install
