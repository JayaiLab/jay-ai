<h1 align="center">
  <a name="readme-top"></a>
  JAYAI
</h1>

<div align="center">
  <a href="https://github.com/JayaiLab/jay-ai/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/JayaiLab/jay-ai" alt="License">
  </a>
  <a href="https://www.npmjs.com/package/@jay-ai/coding-agent">
    <img src="https://img.shields.io/npm/v/@jay-ai/coding-agent" alt="npm version">
  </a>
  <a href="https://github.com/JayaiLab/jay-ai/graphs/contributors">
    <img src="https://img.shields.io/github/contributors/JayaiLab/jay-ai.svg" alt="GitHub Contributors">
  </a>
</div>

---

## What is jay-ai?

**A minimalistic AI coding agent that runs in your terminal.** Authenticate with your existing Claude or ChatGPT subscription via OAuth — no API key required — and let the model read, edit, and run code in your current directory.

The repo also ships the underlying primitives (`@jay-ai/core`, `@jay-ai/agent`, `@jay-ai/tui`) so you can build your own agents on top of the same building blocks.

---

## Feature Overview

| Feature | Description |
|---------|-------------|
| **OAuth login** | Sign in with Anthropic (Claude Pro/Max) or OpenAI Codex (ChatGPT Plus/Pro) — no API key needed |
| **Multi-provider** | Switch between providers and models on the fly |
| **Slash commands** | `/login`, `/model`, `/transport` work inside an active chat session |
| **Built-in tools** | `read`, `write`, `edit`, `grep`, and `bash` for working with files and running commands |
| **Streaming TUI** | Token-by-token output, syntax-aware rendering, and incremental diff updates |
| **Composable SDK** | The agent loop, terminal UI, and provider primitives are published as separate npm packages |

---

## Quick Start

**Prerequisites:** Node.js >= 20

```bash
# 1. Install the CLI globally
npm install -g @jay-ai/coding-agent

# 2. Authenticate with a provider (opens your browser)
jayai login

# 3. Pick a model
jayai model

# 4. Start chatting from your project directory
cd path/to/your/project
jayai
```

Once you're in a session, you can also run the slash commands `/login`, `/model`, or `/transport` to change settings without leaving chat.

---

## Change Model Provider

Add a new provider (or re-authenticate an existing one) by running:

```bash
jayai login
```

You'll be prompted to pick from Anthropic or OpenAI Codex. The browser opens automatically; after you authorize, paste the code back into the terminal.

From inside a chat session, the equivalent is:

```
/login
```

Credentials are stored at `~/.jayai/auth.json`.

---

## Change Model

List models for the providers you've authenticated and pick one:

```bash
jayai model
```

From inside a chat session:

```
/model
```

Your selection is persisted in `~/.jayai/settings.json` and used on the next launch.

---

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [`@jay-ai/coding-agent`](./packages/coding-agent) | [![npm](https://img.shields.io/npm/v/@jay-ai/coding-agent)](https://www.npmjs.com/package/@jay-ai/coding-agent) | CLI coding agent (`jayai` command) |
| [`@jay-ai/agent`](./packages/agent) | [![npm](https://img.shields.io/npm/v/@jay-ai/agent)](https://www.npmjs.com/package/@jay-ai/agent) | Agent loop with tool execution and streaming |
| [`@jay-ai/tui`](./packages/tui) | [![npm](https://img.shields.io/npm/v/@jay-ai/tui)](https://www.npmjs.com/package/@jay-ai/tui) | Terminal UI components for rendering agent output |
| [`@jay-ai/core`](./packages/core) | [![npm](https://img.shields.io/npm/v/@jay-ai/core)](https://www.npmjs.com/package/@jay-ai/core) | Core primitives: providers, event streaming, types |

---

## Development

**Prerequisites:** Node.js >= 20, npm >= 10

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Typecheck all packages
npm run typecheck
```

To iterate locally, run the CLI directly from the repo:

```bash
node packages/coding-agent/dist/cli.js
```

---

## Releasing

Releases are triggered manually. To ship a release:

1. Add a changeset for your changes:
   ```bash
   npm run changeset
   ```
2. When ready to release, trigger the **Release** workflow from the [Actions tab](../../actions/workflows/release.yml) on GitHub (or via CLI):
   ```bash
   gh workflow run release.yml
   ```

The workflow bumps versions, publishes all packages to npm, and pushes the version tags.

---

## License

MIT

<p align="right" style="font-size: 14px; margin-top: 20px;">
  <a href="#readme-top">↑ Back to Top ↑</a>
</p>
