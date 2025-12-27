# Epicenter Server

Expose your Epicenter workspaces as REST APIs and AI-accessible tools.

## What This Does

`createServer()` is a thin wrapper around a `client` that:

1. **Uses an initialized client** (same initialization as scripts)
2. **Keeps it alive** (doesn't dispose until you stop the server)
3. **Maps HTTP endpoints** to each client action (REST, MCP, WebSocket Sync)

The key difference from running scripts:

- **Scripts**: Client is alive only during the `using` block, then auto-disposed
- **Server**: Client stays alive until you manually stop the server (Ctrl+C)

This means:

- Y.Doc stays in memory
- Observers keep watching for changes
- Indexes keep syncing
- Actions remain callable via HTTP

## Server vs Scripts: When to Use Each

### Use Scripts (Direct Client)

```typescript
// Migration script
{
  await using client = await createClient(blogWorkspace);
  await client.createPost({ ... });
  // Client disposed when block exits
}
```

**Good for:**

- One-off migrations
- Data imports/exports
- CLI tools
- Batch processing

**Requirements:**

- Server must NOT be running in the same directory
- Script has exclusive access to `.epicenter/` storage

### Use Server (HTTP Wrapper)

```typescript
// Long-running server
const client = await createClient([blogWorkspace]);
const server = createServer(client);

server.start({ port: 3913 });
// Client stays alive until Ctrl+C
```

**Good for:**

- Web applications
- API backends
- Real-time collaboration (WebSocket Sync)
- Multiple concurrent clients (via HTTP)

**Benefits:**

- Other processes can use HTTP API instead of direct client
- Client stays alive and keeps indexes synced
- No risk of storage conflicts (only server accesses `.epicenter/`)

### Running Scripts While Server is Active

If you need to run scripts while the server is running, use the HTTP API instead of creating another client:

```typescript
// ❌ DON'T: Create another client (storage conflict!)
{
  await using client = await createClient(blogWorkspace);
  await client.createPost({ ... });
}

// ✅ DO: Use the server's HTTP API
await fetch('http://localhost:3913/workspaces/blog/actions/createPost', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'New Post', content: '...' }),
});
```

The HTTP approach:

- No storage conflicts (server owns the client)
- Works from any language/tool (just HTTP)
- Server handles all concurrency internally

## Quick Start

```typescript
import {
	defineWorkspace,
	createClient,
	createServer,
	id,
	text,
	defineMutation,
	defineQuery,
} from '@epicenter/hq';
import { type } from 'arktype';

const blogWorkspace = defineWorkspace({
	id: 'blog',
	tables: {
		posts: {
			id: id(),
			title: text(),
		},
	},
	providers: {
		/* your providers */
	},
	actions: ({ tables }) => ({
		createPost: defineMutation({
			input: type({ title: 'string' }),
			handler: async ({ title }) => {
				const id = generateId();
				tables.posts.upsert({ id, title });
				return Ok({ id });
			},
		}),
		getAllPosts: defineQuery({
			handler: async () => {
				return Ok(tables.posts.getAllValid());
			},
		}),
	}),
});

// 1. Create the client
const client = await createClient(blogWorkspace);

// 2. Create the server from the client
const server = createServer(client);

// 3. Start the server
server.start({ port: 3913 });
```

Now your actions are available as HTTP endpoints:

- `GET http://localhost:3913/workspaces/blog/actions/getAllPosts`
- `POST http://localhost:3913/workspaces/blog/actions/createPost` with JSON body `{ "title": "My Post" }`

### Multiple Workspaces

```typescript
import { createClient, createServer } from '@epicenter/hq';

const client = await createClient([
	blogWorkspace,
	authWorkspace,
	storageWorkspace,
]);
const server = createServer(client);

server.start({ port: 3913 });
```

Actions from each workspace get their own namespace under `/workspaces`:

- `GET http://localhost:3913/workspaces/blog/actions/getAllPosts`
- `POST http://localhost:3913/workspaces/auth/actions/login`
- `GET http://localhost:3913/workspaces/storage/actions/listFiles`

**URL Hierarchy:**

```
/                                              - API root/discovery
/openapi                                       - OpenAPI spec (JSON)
/scalar                                        - Scalar UI documentation
/mcp                                           - MCP endpoint
/workspaces/{workspaceId}/sync                 - WebSocket sync (y-websocket protocol)
/workspaces/{workspaceId}/actions/{action}     - Workspace actions
/workspaces/{workspaceId}/tables/{table}       - RESTful table CRUD
/workspaces/{workspaceId}/tables/{table}/{id}  - Single row operations
```

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
	"data": {
		/* your action's return value */
	}
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

## RESTful Tables

Tables are automatically exposed as RESTful CRUD endpoints with schema validation.

### Endpoints

| Method   | Path                                          | Description          |
| -------- | --------------------------------------------- | -------------------- |
| `GET`    | `/workspaces/{workspace}/tables/{table}`      | List all valid rows  |
| `GET`    | `/workspaces/{workspace}/tables/{table}/{id}` | Get single row by ID |
| `POST`   | `/workspaces/{workspace}/tables/{table}`      | Create or upsert row |
| `PUT`    | `/workspaces/{workspace}/tables/{table}/{id}` | Update row fields    |
| `DELETE` | `/workspaces/{workspace}/tables/{table}/{id}` | Delete row           |

### Examples

```bash
# List all posts
curl http://localhost:3913/workspaces/blog/tables/posts

# Get a single post
curl http://localhost:3913/workspaces/blog/tables/posts/abc123

# Create a new post
curl -X POST http://localhost:3913/workspaces/blog/tables/posts \
  -H "Content-Type: application/json" \
  -d '{"id": "abc123", "title": "Hello World", "published": false}'

# Update a post
curl -X PUT http://localhost:3913/workspaces/blog/tables/posts/abc123 \
  -H "Content-Type: application/json" \
  -d '{"title": "Updated Title"}'

# Delete a post
curl -X DELETE http://localhost:3913/workspaces/blog/tables/posts/abc123
```

### Response Codes

- `200` - Success (GET, PUT, DELETE)
- `200` - Created/upserted (POST returns `{ success: true }`)
- `404` - Row not found
- `422` - Row exists but fails schema validation

### Input Validation

POST and PUT requests are validated against the table schema. Invalid requests return a 400 error with validation details.

## Model Context Protocol (MCP)

Every server automatically exposes MCP endpoints for AI integration:

**List available tools:**

```bash
POST http://localhost:3913/mcp/tools/list
```

**Call a tool:**

```bash
POST http://localhost:3913/mcp/tools/call
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
import {
	defineWorkspace,
	createClient,
	createServer,
	id,
	text,
	tags,
	defineMutation,
	defineQuery,
} from '@epicenter/hq';
import { type } from 'arktype';

// Define your workspace
const notesWorkspace = defineWorkspace({
	id: 'notes',
	tables: {
		notes: {
			id: id(),
			title: text(),
			content: text(),
			tags: tags({ options: ['work', 'personal', 'ideas'] }),
		},
	},
	providers: {
		sqlite: (c) => sqliteProvider(c),
	},
	actions: ({ tables, providers }) => ({
		createNote: defineMutation({
			input: type({
				title: 'string',
				content: 'string',
				'tags?': 'string[]',
			}),
			handler: async (input) => {
				const id = generateId();
				const note = { id, ...input };
				tables.notes.upsert(note);
				return Ok(note);
			},
		}),
		searchNotes: defineQuery({
			input: type({ query: 'string' }),
			handler: async ({ query }) => {
				const results = await providers.sqlite.posts
					.select()
					.where(like(providers.sqlite.posts.title, `%${query}%`));
				return Ok(results);
			},
		}),
	}),
});

// Initialize client and server
const client = await createClient(notesWorkspace);
const server = createServer(client);

server.start({ port: 8080 });

console.log('Notes API running at http://localhost:8080');
```

Now you have a fully functional notes API:

- `POST /workspaces/notes/actions/createNote` - Create notes
- `GET /workspaces/notes/actions/searchNotes?query=important` - Search notes
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

The `start` method accepts configuration options:

```typescript
server.start({
	port: 3913,
});
```

The returned server object from `start()` is a Bun server instance. You also have access to the underlying Elysia `app`:

```typescript
const { app, start } = createServer(client);

// Add custom routes to the app before starting
app.get('/health', () => 'OK');

const server = start({ port: 3913 });
```

## What's Next

This is a v1 implementation focused on simplicity. Future enhancements might include:

- Action descriptions in MCP tool definitions
- Blob upload/download endpoints

The foundation is solid and extensible.
