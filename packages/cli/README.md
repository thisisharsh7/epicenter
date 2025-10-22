# @epicenter/cli

Command-line interface for Epicenter applications.

## Installation

### Global Installation

```bash
bun install -g @epicenter/cli
epicenter serve
```

### Use with bunx (no installation)

```bash
bunx @epicenter/cli serve
```

### Local Project Installation

```bash
bun add -D @epicenter/cli
bunx epicenter serve
```

## Usage

### Starting the Server

The CLI looks for an `epicenter.config.ts` file in your current directory and starts an HTTP server.

```bash
epicenter serve
```

#### Options

- `--port=<number>`: Specify the port (default: 3000)
- `--dev`: Run in development mode (default)
- `--prod`: Run in production mode
- `--help`: Show help information

#### Examples

```bash
# Start on default port (3000)
epicenter serve

# Start on custom port
epicenter serve --port=8080

# Run in production mode
epicenter serve --prod
```

## Configuration File

Your `epicenter.config.ts` should export your Epicenter app as the default export:

```typescript
import { defineEpicenter } from 'epicenter';
import { pages } from './workspaces/pages';

export default defineEpicenter({
  id: 'my-app',
  workspaces: [pages],
});
```

## What Gets Started

When you run `epicenter serve`, the CLI:

1. Finds your `epicenter.config.ts`
2. Creates an HTTP server with:
   - REST API endpoints for all workspace actions
   - MCP (Model Context Protocol) endpoint at `/mcp`
3. Displays available endpoints and tools
4. Shows the command to connect to Claude Code

## Requirements

- Bun >= 1.0.0
