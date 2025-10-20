# Epicenter Server

Expose your Epicenter workspaces as REST APIs and AI-accessible tools.

## What This Does

Epicenter Server takes your workspace configurations and automatically generates HTTP endpoints for every action you've defined. Your workspace actions become instantly accessible via REST API calls or through AI models using the Model Context Protocol (MCP).

## Quick Start

### Single Workspace Server

```typescript
import { defineWorkspace, createWorkspaceServer } from '@repo/epicenter';

const blogWorkspace = defineWorkspace({
  id: 'blog',
  version: 1,
  name: 'blog',
  schema: { /* your schema */ },
  indexes: { /* your indexes */ },
  actions: ({ db, indexes }) => ({
    createPost: defineMutation({
      input: Type.Object({ title: Type.String() }),
      handler: async ({ title }) => {
        // Your logic here
        return Ok(post);
      }
    }),
    getAllPosts: defineQuery({
      handler: async () => {
        return Ok(posts);
      }
    })
  })
});

// Create the server
const app = await createWorkspaceServer(blogWorkspace);

// Start it with Bun
Bun.serve({
  fetch: app.fetch,
  port: 3000,
});
```

Now your actions are available as HTTP endpoints:
- `GET http://localhost:3000/getAllPosts`
- `POST http://localhost:3000/createPost` with JSON body `{ "title": "My Post" }`

### Multiple Workspaces (Epicenter)

```typescript
import { defineEpicenter, createHttpServer } from '@repo/epicenter';

const epicenter = defineEpicenter({
  id: 'my-app',
  workspaces: [blogWorkspace, authWorkspace, storageWorkspace],
});

const app = await createHttpServer(epicenter);

Bun.serve({
  fetch: app.fetch,
  port: 3000,
});
```

Actions from each workspace get their own namespace:
- `GET http://localhost:3000/blog/getAllPosts`
- `POST http://localhost:3000/auth/login`
- `GET http://localhost:3000/storage/listFiles`

## How It Works

When you create a server, it:

1. **Initializes your workspace(s)** using the same logic as client-side initialization
2. **Discovers all actions** by inspecting the workspace client methods
3. **Creates HTTP routes** for each action (both GET and POST for flexibility)
4. **Exposes MCP endpoints** so AI models can discover and call your actions

## REST API Format

### Request

For actions with input:
- **GET**: Pass parameters as query strings: `?title=Hello&category=tech`
- **POST**: Send JSON body: `{ "title": "Hello", "category": "tech" }`

For actions without input:
- Just call the endpoint

### Response

**Success:**
```json
{
  "data": { /* your action's return value */ }
}
```

**Error:**
```json
{
  "error": {
    "message": "What went wrong"
  }
}
```

HTTP status codes map to error types:
- `400` - Validation errors, invalid input
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not found
- `409` - Conflicts
- `500` - Server errors

## Model Context Protocol (MCP)

Every server automatically exposes MCP endpoints for AI integration:

**List available tools:**
```bash
POST http://localhost:3000/mcp/tools/list
```

**Call a tool:**
```bash
POST http://localhost:3000/mcp/tools/call
Content-Type: application/json

{
  "name": "createPost",
  "arguments": { "title": "AI-generated post" }
}
```

For Epicenter servers, tool names include the workspace: `blog_createPost`, `auth_login`, etc.

This lets AI models like Claude discover your actions and call them automatically when helping users.

## Real-World Example

```typescript
// Define your workspaces (same as client-side)
const notesWorkspace = defineWorkspace({
  id: 'notes',
  version: 1,
  name: 'notes',
  schema: {
    notes: {
      id: id(),
      title: text(),
      content: text(),
      tags: multiSelect({ options: ['work', 'personal', 'ideas'] }),
    }
  },
  indexes: async ({ db }) => ({
    sqlite: await sqliteIndex(db, { database: './data/notes.db' })
  }),
  actions: ({ db, indexes }) => ({
    createNote: defineMutation({
      input: Type.Object({
        title: Type.String(),
        content: Type.String(),
        tags: Type.Optional(Type.Array(Type.String())),
      }),
      handler: async (input) => {
        const note = { id: generateId(), ...input };
        db.tables.notes.insert(note);
        return Ok(note);
      }
    }),
    searchNotes: defineQuery({
      input: Type.Object({ query: Type.String() }),
      handler: async ({ query }) => {
        const results = await indexes.sqlite.db
          .select()
          .from(indexes.sqlite.notes)
          .where(like(indexes.sqlite.notes.title, `%${query}%`))
          .all();
        return Ok(results);
      }
    })
  })
});

// Expose as server
const app = await createWorkspaceServer(notesWorkspace);

Bun.serve({
  fetch: app.fetch,
  port: 8080,
  development: process.env.NODE_ENV === 'development',
});

console.log('Notes API running at http://localhost:8080');
```

Now you have a fully functional notes API:
- `POST /createNote` - Create notes
- `GET /searchNotes?query=important` - Search notes
- `POST /mcp/tools/call` - Let AI create/search notes

## When to Use This

**Good for:**
- Creating HTTP APIs from your workspace logic
- Enabling AI assistants to interact with your data
- Building backend services for web/mobile apps
- Exposing workspace functionality to external systems

**Not needed if:**
- You're building a local-only desktop app (just use `createWorkspaceClient`)
- Your app doesn't need HTTP access
- You want to keep everything client-side

## Configuration

Both functions accept an optional `RuntimeConfig` parameter (same as workspace clients):

```typescript
const app = await createHttpServer(epicenter, {
  // Future: persistence options, sync providers, etc.
});
```

The returned Hono app gives you full control:

```typescript
// Add middleware
app.use('*', logger());
app.use('/admin/*', authMiddleware);

// Add custom routes
app.get('/health', (c) => c.text('OK'));

// Configure Bun.serve however you want
Bun.serve({
  fetch: app.fetch,
  port: process.env.PORT || 3000,
  hostname: '0.0.0.0',
  development: true,
});
```

## What's Next

This is a v1 implementation focused on simplicity. Future enhancements might include:
- Input validation middleware using action schemas
- Action descriptions in MCP tool definitions
- Separate GET/POST routing based on query vs mutation types
- WebSocket support for real-time YJS sync
- stdio transport for local MCP usage

The foundation is solid and extensible.
