# Using Epicenter as an MCP Server

This guide shows how to connect your Epicenter server to Claude Code as an MCP (Model Context Protocol) server using HTTP transport.

## What You'll Get

Once connected, Claude Code can:
- List all your workspace actions as tools
- Execute queries (read operations)
- Execute mutations (write operations)
- Validate inputs using your TypeBox schemas
- Return structured data from your indexes

## Quick Start

### 1. Start Your Epicenter Server

```bash
cd packages/epicenter/examples/content-hub
bun run server-http.ts
```

The server will start on http://localhost:3913 with:
- REST API endpoints at `/{workspace}/{action}`
- MCP endpoint at `/mcp`

### 2. Add to Claude Code

Using the CLI (recommended):
```bash
claude mcp add content-hub --transport http --scope user http://localhost:3913/mcp
```

Or add manually to `~/.claude.json`:
```json
{
  "mcpServers": {
    "content-hub": {
      "transport": "http",
      "url": "http://localhost:3913/mcp"
    }
  }
}
```

**Note**: Claude Code automatically handles the required headers (`Accept: application/json, text/event-stream`) and streaming configuration. For servers requiring authentication, use the `--header` flag.

### 3. Test the Connection

In Claude Code, you can now:

```
List available tools:
@epicenter-content-hub what tools do you have?

Query pages:
@epicenter-content-hub get all pages

Create a page:
@epicenter-content-hub create a new blog post titled "Hello World" with content "My first post" tagged as tech
```

## How It Works

### Server Architecture

The `createHttpServer()` function:

1. **Exposes REST endpoints** for each action:
   ```
   GET/POST /{workspace}/{action}
   ```

2. **Exposes MCP endpoint** using StreamableHTTPTransport:
   ```
   POST /mcp
   ```

   The MCP endpoint communicates using Server-Sent Events (SSE):
   - Client sends JSON-RPC requests via HTTP POST
   - Server responds with SSE stream (`event: message\ndata: {...}`)
   - Each event contains a JSON-RPC response
   - This allows for bidirectional communication over HTTP

3. **Registers all actions as MCP tools** with:
   - Input validation via TypeBox schemas
   - Output validation
   - Error handling with proper MCP error codes

### Example Actions

From the content-hub example:

**Query (Read Operation):**
```typescript
getPages: defineQuery({
  handler: async () => {
    const pages = await indexes.sqlite.db
      .select()
      .from(indexes.sqlite.pages)
      .all();
    return Ok(pages);
  },
})
```

**Mutation (Write Operation):**
```typescript
createPage: defineMutation({
  input: Type.Object({
    title: Type.String(),
    content: Type.String(),
    type: Type.Union([
      Type.Literal('blog'),
      Type.Literal('article'),
      // ...
    ]),
  }),
  handler: async (data) => {
    const page = {
      id: generateId(),
      ...data,
    };
    db.tables.pages.insert(page);
    return Ok(page);
  },
})
```

### MCP Tool Format

Each action becomes an MCP tool with:
- **Name**: `{workspace}_{action}` (e.g., `pages_getPages`, `pages_createPage`)
- **Input Schema**: Derived from `defineQuery`/`defineMutation` input
- **Description**: From action metadata
- **Validation**: Automatic via TypeBox

## Running Your Own Server

### 1. Define Your Workspace

```typescript
import {
  defineWorkspace,
  defineQuery,
  defineMutation,
  sqliteIndex,
  id,
  text,
} from '@epicenter/epicenter';

export const myWorkspace = defineWorkspace({
  id: 'my-workspace',
  version: 1,
  name: 'my-workspace',

  schema: {
    items: {
      id: id(),
      title: text(),
    },
  },

  indexes: async ({ db }) => ({
    sqlite: await sqliteIndex(db, { database: 'my-workspace.db' }),
  }),

  actions: ({ db, indexes }) => ({
    getItems: defineQuery({
      handler: async () => {
        const items = await indexes.sqlite.db
          .select()
          .from(indexes.sqlite.items)
          .all();
        return Ok(items);
      },
    }),
  }),
});
```

### 2. Create Server

```typescript
import { createHttpServer, defineEpicenter } from '@epicenter/epicenter';
import { myWorkspace } from './workspace';

const app = await createHttpServer(
  defineEpicenter({
    id: 'my-app',
    workspaces: [myWorkspace],
  })
);

Bun.serve({
  fetch: app.fetch,
  port: 3913,
});
```

### 3. Add to Claude Code

```bash
claude mcp add my-app --transport http --scope user http://localhost:3913/mcp
```

## Advanced Usage

### Multiple Workspaces

```typescript
const app = await createHttpServer(
  defineEpicenter({
    id: 'multi-workspace-app',
    workspaces: [workspace1, workspace2, workspace3],
  })
);
```

All actions from all workspaces become available as MCP tools with the naming pattern `{workspace}_{action}`.

### Custom Port

```typescript
const PORT = 4000;

Bun.serve({
  fetch: app.fetch,
  port: PORT,
});

// Update Claude Code config:
claude mcp add my-app --transport http --scope user http://localhost:4000/mcp
```

### Environment Variables

Pass environment variables to your actions:

```typescript
actions: ({ db, indexes }) => ({
  fetchExternalData: defineQuery({
    handler: async () => {
      const apiKey = process.env.API_KEY;
      // use apiKey...
    },
  }),
})
```

Then configure in Claude Code:

```bash
# Using CLI with environment variable
claude mcp add my-app --transport http --scope user http://localhost:3913/mcp \
  --env API_KEY=your-key-here
```

Or manually in `~/.claude.json`:

```json
{
  "mcpServers": {
    "my-app": {
      "transport": "http",
      "url": "http://localhost:3913/mcp",
      "env": {
        "API_KEY": "your-key-here"
      }
    }
  }
}
```

## Troubleshooting

### Server Not Starting
- Check port availability: `lsof -i :3913`
- Verify workspace configuration is valid
- Check for TypeBox schema errors

### Claude Code Can't Connect
- Ensure server is running: `curl http://localhost:3913/mcp`
- Check `~/.claude.json` syntax
- Restart Claude Code after config changes
- Use `claude mcp list` to verify server is registered

### Tools Not Appearing
- Verify actions are defined with `defineQuery` or `defineMutation`
- Check server logs for errors
- Restart Claude Code
- Try: `@epicenter-content-hub list available tools`

### Validation Errors
- Review TypeBox schema definitions
- Check input format matches schema
- Look for MCP error messages in Claude Code

## Reference

### MCP Endpoint Behavior

The `/mcp` endpoint handles two request types:

1. **List Tools** (`tools/list`):
   - Returns all workspace actions as tools
   - Includes input schemas and descriptions

2. **Call Tool** (`tools/call`):
   - Validates input against TypeBox schema
   - Executes the action
   - Validates output (if schema provided)
   - Returns structured result or error

### Error Handling

The server returns proper MCP error codes:
- `InvalidParams`: Unknown tool or validation error
- `InternalError`: Output validation failure or execution error

### Data Flow

```
Claude Code → POST /mcp → MCP Server → StreamableHTTPTransport
                                      ↓
                               Validate Input (TypeBox)
                                      ↓
                               Execute Action
                                      ↓
                               Validate Output (TypeBox)
                                      ↓
                            Return Result/Error ← Claude Code
```

## Next Steps

- Explore the [HTTP server](./server-http.ts)
- Review [workspace configuration](./epicenter.config.ts)
- Learn about [indexes](../../src/indexes/sqlite/index.ts)
- Read [action definitions](../../src/core/actions.ts)
