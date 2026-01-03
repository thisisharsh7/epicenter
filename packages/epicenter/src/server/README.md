# Epicenter Server

Expose your workspace clients as REST APIs and AI-accessible tools.

## What This Does

`createServer()` wraps workspace clients and:

1. **Takes initialized clients** (single or array)
2. **Keeps them alive** (doesn't dispose until you stop the server)
3. **Maps HTTP endpoints** to each action (REST, WebSocket Sync)

The key difference from running scripts:

- **Scripts**: Client is alive only during the `using` block, then auto-disposed
- **Server**: Clients stay alive until you manually stop the server (Ctrl+C)

## Quick Start

```typescript
import {
	defineWorkspace,
	defineMutation,
	defineQuery,
	createServer,
	id,
	text,
} from '@epicenter/hq';
import { type } from 'arktype';

// 1. Define workspace contract
const blogWorkspace = defineWorkspace({
	id: 'blog',
	tables: {
		posts: { id: id(), title: text() },
	},
	actions: {
		createPost: defineMutation({
			input: type({ title: 'string' }),
			output: type({ id: 'string' }),
		}),
		getAllPosts: defineQuery({
			output: type({ id: 'string', title: 'string' }).array(),
		}),
	},
});

// 2. Create client with handlers
const blogClient = await blogWorkspace
	.withProviders({ sqlite: sqliteProvider })
	.createWithHandlers({
		createPost: async (input, ctx) => {
			const id = generateId();
			ctx.tables.posts.upsert({ id, title: input.title });
			return { id };
		},
		getAllPosts: async (input, ctx) => {
			return ctx.tables.posts
				.getAllValid()
				.map((p) => ({ id: p.id, title: p.title }));
		},
	});

// 3. Create and start server
const server = createServer(blogClient, { port: 3913 });
server.start();
```

Now your actions are available as HTTP endpoints:

- `GET http://localhost:3913/workspaces/blog/actions/getAllPosts`
- `POST http://localhost:3913/workspaces/blog/actions/createPost`

## API

### `createServer(client, options?)` or `createServer(clients, options?)`

**Signatures:**

```typescript
function createServer(client: WorkspaceClient, options?: ServerOptions): Server;
function createServer(
	clients: WorkspaceClient[],
	options?: ServerOptions,
): Server;

type ServerOptions = {
	port?: number; // Default: 3913
};
```

**Usage:**

```typescript
// Single workspace
createServer(blogClient);
createServer(blogClient, { port: 8080 });

// Multiple workspaces (array - IDs from workspace definitions)
createServer([blogClient, authClient]);
createServer([blogClient, authClient], { port: 8080 });
```

**Why array, not object?**

- Workspace IDs come from `defineWorkspace({ id: 'blog' })`
- No redundancy (don't type 'blog' twice)
- Less error-prone (can't mismatch key and workspace ID)

### Server Methods

```typescript
const server = createServer(blogClient, { port: 3913 });

server.app; // Underlying Elysia instance
server.start(); // Start the HTTP server
await server.destroy(); // Stop server and cleanup all clients
```

## Multiple Workspaces

```typescript
const blogClient = await blogWorkspace
  .withProviders({ sqlite: sqliteProvider })
  .createWithHandlers({ ... });

const authClient = await authWorkspace
  .withProviders({ sqlite: sqliteProvider })
  .createWithHandlers({ ... });

// Pass array of clients
const server = createServer([blogClient, authClient], { port: 3913 });
server.start();
```

Routes are namespaced by workspace ID:

- `/workspaces/blog/actions/createPost`
- `/workspaces/auth/actions/login`

## URL Hierarchy

```
/                                              - API root/discovery
/openapi                                       - Scalar UI documentation
/openapi/json                                  - OpenAPI spec (JSON)
/workspaces/{workspaceId}/sync                 - WebSocket sync (y-websocket protocol)
/workspaces/{workspaceId}/actions/{action}     - Workspace actions
/workspaces/{workspaceId}/tables/{table}       - RESTful table CRUD
/workspaces/{workspaceId}/tables/{table}/{id}  - Single row operations
```

## Server vs Scripts

### Use Scripts (Direct Client)

```typescript
{
  await using client = await blogWorkspace
    .withProviders({ sqlite: sqliteProvider })
    .createWithHandlers({ ... });

  await client.actions.createPost({ title: 'Hello' });
  // Client disposed when block exits
}
```

**Good for:** One-off migrations, data imports, CLI tools, batch processing

**Requirements:** Server must NOT be running in the same directory

### Use Server (HTTP Wrapper)

```typescript
const client = await blogWorkspace
  .withProviders({ sqlite: sqliteProvider })
  .createWithHandlers({ ... });

const server = createServer(client, { port: 3913 });
server.start();
// Clients stay alive until Ctrl+C
```

**Good for:** Web applications, API backends, real-time collaboration

### Running Scripts While Server is Active

Use the HTTP API instead of creating another client:

```typescript
// ❌ DON'T: Create another client (storage conflict!)
{
  await using client = await blogWorkspace...createWithHandlers({ ... });
  await client.actions.createPost({ ... });
}

// ✅ DO: Use the server's HTTP API
await fetch('http://localhost:3913/workspaces/blog/actions/createPost', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'New Post' }),
});
```

## REST API Format

### Request

**Query actions (GET):** Pass parameters as query strings

```
GET /workspaces/blog/actions/getPost?id=123
```

**Mutation actions (POST):** Send JSON body

```
POST /workspaces/blog/actions/createPost
Content-Type: application/json

{ "title": "Hello" }
```

### Response

**Success:**

```json
{ "data": { "id": "123" } }
```

**Error:**

```json
{ "error": { "message": "What went wrong" } }
```

## RESTful Tables

Tables are automatically exposed as CRUD endpoints:

| Method   | Path                                          | Description          |
| -------- | --------------------------------------------- | -------------------- |
| `GET`    | `/workspaces/{workspace}/tables/{table}`      | List all valid rows  |
| `GET`    | `/workspaces/{workspace}/tables/{table}/{id}` | Get single row by ID |
| `POST`   | `/workspaces/{workspace}/tables/{table}`      | Create or upsert row |
| `PUT`    | `/workspaces/{workspace}/tables/{table}/{id}` | Update row fields    |
| `DELETE` | `/workspaces/{workspace}/tables/{table}/{id}` | Delete row           |

## Custom Routes

Access the underlying Elysia app to add custom routes:

```typescript
const server = createServer(blogClient, { port: 3913 });

// Add custom routes before starting
server.app.get('/health', () => 'OK');
server.app.get('/version', () => ({ version: '1.0.0' }));

server.start();
```

## Lifecycle Management

```typescript
const server = createServer([blogClient, authClient], { port: 3913 });

// Start the server
server.start();

// Server handles SIGINT/SIGTERM for graceful shutdown
// Or manually destroy:
await server.destroy(); // Stops server, cleans up all clients
```
