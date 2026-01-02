# Workspace

A workspace is a self-contained domain module with its own schema, providers, and actions.

## What is a Workspace?

Each workspace creates its own independent client:

```typescript
const blogWorkspace = defineWorkspace({
	id: 'blog',
	tables: { posts: { id: id(), title: text() } },
	actions: {
		createPost: defineMutation({
			input: type({ title: 'string' }),
			output: type({ id: 'string' }),
		}),
	},
});

// Create a client with handlers
const blogClient = await blogWorkspace
	.withProviders({ sqlite: sqliteProvider })
	.createWithHandlers({
		createPost: async (input, ctx) => {
			const id = generateId();
			ctx.tables.posts.upsert({ id, title: input.title });
			return { id };
		},
	});

// Use the client
await blogClient.createPost({ title: 'Hello' });
```

Each workspace has:

- **Tables**: Define your data structure with typed columns
- **Providers**: Persistence and sync capabilities (SQLite, IndexedDB, markdown, etc.)
- **Actions**: Business logic (queries and mutations) with access to tables and providers

## Contract/Handler Separation

The workspace architecture separates **contracts** (what actions exist) from **handlers** (how they execute):

```typescript
import {
	defineWorkspace,
	defineMutation,
	defineQuery,
	id,
	text,
} from '@epicenter/hq';
import { type } from 'arktype';

// 1. Define the contract (isomorphic - works everywhere)
const blogWorkspace = defineWorkspace({
	id: 'blog',
	tables: {
		posts: { id: id(), title: text(), published: boolean({ default: false }) },
	},
	actions: {
		publishPost: defineMutation({
			input: type({ id: 'string' }),
			output: type({ success: 'boolean' }),
		}),
		getPost: defineQuery({
			input: type({ id: 'string' }),
			output: type({ id: 'string', title: 'string' }),
		}),
	},
});

// 2. Server: Create client with handlers (actions execute locally)
const serverClient = await blogWorkspace
	.withProviders({ sqlite: sqliteProvider })
	.createWithHandlers({
		publishPost: async (input, ctx) => {
			ctx.tables.posts.update({ id: input.id, published: true });
			return { success: true };
		},
		getPost: async (input, ctx) => {
			const result = ctx.tables.posts.get(input.id);
			if (result.status !== 'valid') throw new Error('Not found');
			return { id: result.row.id, title: result.row.title };
		},
	});

// 3. Browser: Create HTTP client (actions proxy to server)
const browserClient = await blogWorkspace
	.withProviders({ indexeddb: idbProvider })
	.createHttpClient('http://localhost:3913');

// Both clients have the same API:
await serverClient.publishPost({ id: '1' }); // Executes locally
await browserClient.publishPost({ id: '1' }); // Proxies to server
```

**Key benefits:**

- **Isomorphic**: Same contract works in browser and server
- **Type-safe**: Handlers are type-checked against contracts
- **Flexible**: Mix local execution (server) with HTTP proxying (browser)
- **Serializable**: Action contracts are JSON-serializable for MCP/OpenAPI

## Handler Context

Handlers receive `(input, ctx)` where ctx provides:

```typescript
type HandlerContext = {
	tables: Tables; // YJS-backed table operations
	schema: Schema; // Table schemas
	validators: Validators; // Runtime validators
	providers: Providers; // Provider exports (SQLite, etc.)
	paths?: WorkspacePaths; // Filesystem paths (undefined in browser)
};
```

## Creating Servers

Use `createServer` to expose workspace clients over HTTP:

```typescript
import { createServer } from '@epicenter/hq';

// Single workspace
const server = createServer(blogClient, { port: 3913 });

// Multiple workspaces (array - IDs come from workspace definitions)
const server = createServer([blogClient, authClient], { port: 3913 });

// Start and manage lifecycle
server.start();
await server.destroy(); // Cleanup all clients
```

Routes are automatically namespaced by workspace ID:

- `/workspaces/blog/actions/publishPost`
- `/workspaces/auth/actions/login`

## Browser vs Node.js Initialization

**Browser (sync + whenSynced):**

```typescript
// Returns immediately - UI can render while data loads
const client = blogWorkspace
	.withProviders({ indexeddb: idbProvider })
	.createHttpClient('http://localhost:3913');

// Wait for providers to sync if needed
await client.whenSynced;
```

**Node.js (async):**

```typescript
// Await required - fully initializes before returning
const client = await blogWorkspace
  .withProviders({ sqlite: sqliteProvider })
  .createWithHandlers({ ... });
```

The browser uses sync creation + `whenSynced` to allow immediate UI rendering while data loads in the background.

## Cross-Workspace Communication

Use regular JavaScript imports for dependencies:

```typescript
// auth-client.ts
export const authClient = await authWorkspace
  .withProviders({ sqlite: sqliteProvider })
  .createWithHandlers({ ... });

// blog-client.ts
import { authClient } from './auth-client';

const blogClient = await blogWorkspace
  .withProviders({ sqlite: sqliteProvider })
  .createWithHandlers({
    createPost: async (input, ctx) => {
      // Use authClient directly via import
      await authClient.verifyToken();
      ctx.tables.posts.upsert({ ... });
      return { id: generateId() };
    },
  });
```

No magic dependency injection. Just regular JS imports.

## Client Properties

```typescript
const client = await blogWorkspace
  .withProviders({ sqlite: sqliteProvider })
  .createWithHandlers({ ... });

client.$id;          // 'blog' - workspace ID
client.$tables;      // YJS-backed table operations
client.$providers;   // Provider exports
client.$validators;  // Runtime validators
client.$paths;       // Filesystem paths (undefined in browser)
client.$ydoc;        // Underlying YJS document
client.$contracts;   // Action contracts (for server route registration)

await client.destroy();           // Cleanup resources
await using client = await ...;   // Auto-cleanup with dispose
```

## Sequential Script Execution

Multiple scripts can safely run using `await using`:

```typescript
// Script 1: Import data
{
  await using client = await blogWorkspace
    .withProviders({ sqlite: sqliteProvider })
    .createWithHandlers({ ... });

  await client.importData(data);
  // Auto-disposed when block exits
}

// Script 2: Process data (runs after Script 1)
{
  await using client = await blogWorkspace
    .withProviders({ sqlite: sqliteProvider })
    .createWithHandlers({ ... });

  const posts = client.$tables.posts.getAllValid();
  // Auto-disposed when block exits
}
```
