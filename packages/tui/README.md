# @jay-ai/tui

[![npm](https://img.shields.io/npm/v/@jay-ai/tui)](https://www.npmjs.com/package/@jay-ai/tui)

Terminal UI components for rendering agent output — messages, tool executions, prompts, and more.

## Installation

```bash
npm install @jay-ai/tui
```

## What's included

- `Terminal` — manages terminal rendering and component lifecycle
- `Component` / `Container` — base primitives for building terminal UIs
- `AssistantMessageComponent` — renders streamed assistant messages with markdown
- `ToolExecutionComponent` — renders tool call input/output
- `UserMessageComponent` — renders user messages
- `PromptComponent` — interactive input prompt
- `WelcomeComponent` — welcome screen

## Usage

```ts
import { Terminal, AssistantMessageComponent } from "@jay-ai/tui";
```

## Requirements

Node.js >= 24
