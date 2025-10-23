# Content Hub Example

A practical example demonstrating how to build a content management system with Epicenter. This example shows how to create workspaces, define actions, and run both CLI and server interfaces.

## What's Inside

- **`epicenter.config.ts`**: Workspace definitions for managing pages and social media content
- **`cli.ts`**: Command-line interface for interacting with your data
- **`server-http.ts`**: HTTP server exposing REST and MCP endpoints
- **`server.test.ts`**: Tests demonstrating how to test your server

## Quick Start

### 1. Run the HTTP Server

```bash
bun ../../src/cli/bin.ts serve
```

This starts an HTTP server on port 3913 with:

- REST API endpoints for your workspace actions
- MCP (Model Context Protocol) integration
- Automatic data persistence

### 2. Try the API

```bash
# Create a page
curl -X POST http://localhost:3913/pages/createPage \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My First Post",
    "content": "Hello world",
    "type": "blog",
    "tags": "tech"
  }'

# Get all pages
curl http://localhost:3913/pages/getPages

# Get a specific page
curl "http://localhost:3913/pages/getPage?id=<page-id>"
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

The `epicenter serve` command reads your `epicenter.config.ts` and automatically:

- Creates REST endpoints for each workspace action
- Exposes MCP protocol endpoints at `/mcp`
- Handles request validation and error responses
- Manages data persistence

**Endpoint Patterns:**

- `GET/POST /<workspace>/<action>`: Call workspace actions directly
- Query parameters or JSON body for input
- Returns `{ data: <result> }` or `{ error: <error> }`

## Learn More

- [Epicenter Documentation](../../README.md)
