# Content Hub Example

A practical example demonstrating how to build a content management system with Epicenter. This example shows how to create workspaces, define actions, and run both CLI and server interfaces.

## What's Inside

- **`epicenter.config.ts`**: Workspace definitions for managing pages and social media content
- **`cli.ts`**: Command-line interface for interacting with your data
- **`server.ts`**: HTTP server exposing REST and MCP endpoints
- **`server.test.ts`**: Tests demonstrating how to test your server

## Quick Start

### 1. Run the Server

```bash
bun run server.ts
```

This starts an HTTP server on port 3000 with:
- REST API endpoints for your workspace actions
- MCP (Model Context Protocol) integration
- Automatic data persistence

### 2. Try the API

```bash
# Create a page
curl -X POST http://localhost:3000/pages/createPage \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My First Post",
    "content": "Hello world",
    "type": "blog",
    "tags": "tech"
  }'

# Get all pages
curl http://localhost:3000/pages/getPages

# Get a specific page
curl "http://localhost:3000/pages/getPage?id=<page-id>"
```

### 3. Use the CLI

```bash
# Run CLI commands
bun run cli.ts

# Examples (once implemented):
bun run cli.ts pages create --title "My Post" --type blog
bun run cli.ts pages list
```

### 4. Run Tests

```bash
# Run the server tests
bun test server.test.ts

# Run all tests
bun test
```

## How It Works

### Server Architecture

The server is created using `createEpicenterServer()`:

```typescript
const contentHub = defineEpicenter({
  id: 'content-hub',
  workspaces: [pages, contentHub],
});

const app = await createEpicenterServer(contentHub);

Bun.serve({
  fetch: app.fetch,
  port: 3000,
});
```

This automatically:
- Creates REST endpoints for each workspace action
- Exposes MCP protocol endpoints
- Handles request validation and error responses
- Manages data persistence

### Endpoint Patterns

**REST Endpoints:**
- `GET/POST /<workspace>/<action>`: Call workspace actions directly
- Query parameters or JSON body for input
- Returns `{ data: <result> }` or `{ error: <error> }`

**MCP Endpoints:**
- `POST /mcp/tools/list`: List all available tools (workspace actions)
- `POST /mcp/tools/call`: Call a tool with arguments

### Testing Pattern

The tests demonstrate the recommended pattern:

```typescript
// 1. Create server
const app = await createEpicenterServer(epicenter);

// 2. Start on random port
const server = Bun.serve({
  fetch: app.fetch,
  port: 0,
});

// 3. Make requests
const response = await fetch(`http://localhost:${server.port}/pages/getPages`);

// 4. Verify responses
expect(response.status).toBe(200);
const data = await response.json();
expect(data.data).toBeDefined();
```

## What's Next

This example shows the basics. You can extend it with:

1. **Authentication**: Add auth middleware to protect endpoints
2. **Rate limiting**: Add rate limiting for production use
3. **WebSockets**: Add real-time updates for collaborative editing
4. **File uploads**: Handle media uploads for your content
5. **Search**: Add full-text search across pages

## Learn More

- [Epicenter Documentation](../../README.md)
- [Workspace Guide](../../docs/workspaces.md)
- [Server API Reference](../../docs/server-api.md)
