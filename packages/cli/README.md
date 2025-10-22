# @epicenter/cli

Command-line interface for Epicenter applications.

## Installation

### Global Installation

```bash
bun install -g @epicenter/cli
epicenter serve
epicenter pages createPage --title "My Post" --content "Hello" --type blog --tags tech
```

### Use with bunx (no installation)

```bash
bunx @epicenter/cli serve
bunx @epicenter/cli pages createPage --title "My Post"
```

### Local Project Installation

```bash
bun add -D @epicenter/cli
bunx epicenter serve
```

## Commands

The CLI provides two types of commands:

### 1. HTTP Server

Start an HTTP server with REST API and MCP endpoints:

```bash
epicenter serve [options]
```

**Options:**
- `--port=<number>`: Port to run the server on (default: 3000)
- `--dev`: Run in development mode (default)
- `--prod`: Run in production mode

**Example:**
```bash
epicenter serve --port=8080 --prod
```

### 2. Workspace Actions

Execute workspace actions directly from the command line:

```bash
epicenter <workspace> <action> [flags]
```

Your action's TypeBox input schema automatically becomes CLI flags. The CLI handles validation, type conversion, and result display.

**Example:**
```bash
epicenter pages createPage \
  --title "My First Post" \
  --content "Hello world" \
  --type blog \
  --tags tech

epicenter pages getPages
epicenter pages getPage --id abc123
```

## Configuration File

Your `epicenter.config.ts` should export your Epicenter app as the default export:

```typescript
import { defineEpicenter } from '@epicenter/hq';
import { pages } from './workspaces/pages';

export default defineEpicenter({
  id: 'my-app',
  workspaces: [pages],
});
```

## Schema-Driven CLI Flags

TypeBox schemas automatically become CLI options:

- `Type.String()` → `--flag <value>`
- `Type.Number()` → `--flag <number>`
- `Type.Boolean()` → `--flag` (presence = true)
- `Type.Array(Type.String())` → `--flag item1 item2` (space-separated)
- `Type.Union([Literal('a'), Literal('b')])` → `--flag <choice>` (validated)
- `Type.Optional()` → flag is optional
- `{ description }` → shows in `--help`

## Help System

Get help for any command:

```bash
epicenter --help                    # Show all commands
epicenter serve --help              # Show serve options
epicenter pages --help              # Show pages actions
epicenter pages createPage --help   # Show action flags
```

## Architecture

This package is a thin wrapper around `@epicenter/hq/cli`, which contains the core CLI generation logic. The architecture allows:

- **Reusable CLI generation**: Other tools can programmatically use the CLI
- **Consistent behavior**: All CLI features share the same implementation
- **Easy maintenance**: Core logic lives with the framework
- **Extensibility**: New commands can be added by updating the framework

## Requirements

- Bun >= 1.0.0
