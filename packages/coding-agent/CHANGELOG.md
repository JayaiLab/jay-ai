# @jay-ai/coding-agent

## 0.3.0

### Minor Changes

- 05b5f87: Automatically open the OAuth authorization URL in the user's default browser during `/login` (and at first-run login). The URL is still printed to the terminal as a fallback.

### Patch Changes

- 1e11303: Wrap rendered rows in input, select, footer, and prompt components so wide content doesn't desync the diff renderer; fix bracketed paste when the whole paste arrives in one stdin chunk; drop the "> " prefix from prompt input; add Option/Alt+Enter newline hint to the footer.
- Updated dependencies [1e11303]
  - @jay-ai/tui@0.3.0
  - @jay-ai/core@0.3.0
  - @jay-ai/agent@0.3.0

## 0.2.1

### Patch Changes

- be32139: Fix cursor positioning on paste and arrow keys, add loader spinner and footer components, make debug logging opt-in
- Updated dependencies [be32139]
  - @jay-ai/tui@0.2.1
  - @jay-ai/core@0.2.1
  - @jay-ai/agent@0.2.1

## 0.2.0

### Minor Changes

- 790197e: feat: add OpenAI Codex streaming provider with SSE and WebSocket support

### Patch Changes

- Updated dependencies [790197e]
  - @jay-ai/core@0.2.0
  - @jay-ai/agent@0.2.0
  - @jay-ai/tui@0.2.0

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
