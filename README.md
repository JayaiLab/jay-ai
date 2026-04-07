# jay-ai

A minimalistic AI framework with a coding agent at its core.

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [`@jay-ai/core`](./packages/core) | [![npm](https://img.shields.io/npm/v/@jay-ai/core)](https://www.npmjs.com/package/@jay-ai/core) | Core primitives: providers, event streaming, types |
| [`@jay-ai/agent`](./packages/agent) | [![npm](https://img.shields.io/npm/v/@jay-ai/agent)](https://www.npmjs.com/package/@jay-ai/agent) | Agent loop with tool execution and streaming |
| [`@jay-ai/tui`](./packages/tui) | [![npm](https://img.shields.io/npm/v/@jay-ai/tui)](https://www.npmjs.com/package/@jay-ai/tui) | Terminal UI components for rendering agent output |
| [`@jay-ai/coding-agent`](./packages/coding-agent) | [![npm](https://img.shields.io/npm/v/@jay-ai/coding-agent)](https://www.npmjs.com/package/@jay-ai/coding-agent) | CLI coding agent (`jayai` command) |

## Development

**Prerequisites:** Node.js >= 24, npm >= 10

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Typecheck all packages
npm run typecheck
```

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

The workflow will bump versions, publish all packages to npm, and push the version tags.

## License

MIT
