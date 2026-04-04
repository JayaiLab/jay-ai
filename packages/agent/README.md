# @jay-ai/agent

[![npm](https://img.shields.io/npm/v/@jay-ai/agent)](https://www.npmjs.com/package/@jay-ai/agent)

Agent loop with tool execution and streaming, built on `@jay-ai/core`.

## Installation

```bash
npm install @jay-ai/agent @jay-ai/core
```

## Usage

```ts
import { Agent, AgentEventStream } from "@jay-ai/agent";
import type { AgentConfig, AgentTool } from "@jay-ai/agent";

const agent = new Agent({
  // ...config
});

const stream = agent.run("Your prompt here");
for await (const event of stream) {
  // handle events
}
```

## Requirements

Node.js >= 20
