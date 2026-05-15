# @jay-ai/tui

## 0.3.0

### Patch Changes

- 1e11303: Wrap rendered rows in input, select, footer, and prompt components so wide content doesn't desync the diff renderer; fix bracketed paste when the whole paste arrives in one stdin chunk; drop the "> " prefix from prompt input; add Option/Alt+Enter newline hint to the footer.
  - @jay-ai/agent@0.3.0

## 0.2.1

### Patch Changes

- be32139: Fix cursor positioning on paste and arrow keys, add loader spinner and footer components, make debug logging opt-in
  - @jay-ai/agent@0.2.1

## 0.2.0

### Patch Changes

- Updated dependencies [790197e]
  - @jay-ai/agent@0.2.0

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
  - @jay-ai/agent@0.1.0

## 0.0.4

### Patch Changes

- bb50809: Add MIT license field to all packages
- Updated dependencies [bb50809]
  - @jay-ai/agent@0.0.4

## 0.0.3

### Patch Changes

- f9569c8: Add engines field to require Node.js >= 20
- Updated dependencies [f9569c8]
  - @jay-ai/agent@0.0.3
