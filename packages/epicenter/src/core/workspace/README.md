# Workspace

A workspace is a self-contained domain module with its own schema and providers.

## What is a Workspace?

Each workspace creates its own independent client:

```typescript
const blogWorkspace = defineWorkspace({
	id: 'blog',
	tables: { posts: { id: id(), title: text() } },
});

// Create a client with providers
const blogClient = await blogWorkspace
	.withProviders({ sqlite: sqliteProvider })
	.create();

// Use the client
blogClient.tables.posts.upsert({ id: '1', title: 'Hello' });
const posts = blogClient.tables.posts.getAllValid();
```

Each workspace has:

- **Tables**: Define your data structure with typed columns
- **Providers**: Persistence and sync capabilities (SQLite, IndexedDB, markdown, etc.)

## Writing Functions

Write regular functions that use your client:

```typescript
const client = await blogWorkspace
	.withProviders({ sqlite: sqliteProvider })
	.create();

function createPost(title: string) {
	const id = generateId();
	client.tables.posts.upsert({ id, title, published: false });
	return { id };
}

function publishPost(id: string) {
	client.tables.posts.update({ id, published: true });
}

function getPublishedPosts() {
	return client.tables.posts.filter((p) => p.published);
}

// Expose via HTTP, MCP, CLI however you want
app.post('/posts', (req) => createPost(req.body.title));
app.put('/posts/:id/publish', (req) => publishPost(req.params.id));
app.get('/posts', () => getPublishedPosts());
```

## Client Properties

```typescript
const client = await blogWorkspace
	.withProviders({ sqlite: sqliteProvider })
	.create();

client.id;         // 'blog' - workspace ID
client.tables;     // YJS-backed table operations
client.kv;         // Key-value store
client.providers;  // Provider exports
client.paths;      // Filesystem paths (undefined in browser)
client.ydoc;       // Underlying YJS document

await client.destroy();           // Cleanup resources
await using client = await ...;   // Auto-cleanup with dispose
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

- `/workspaces/blog/tables/posts`
- `/workspaces/auth/tables/users`

## Cross-Workspace Communication

Use regular JavaScript imports for dependencies:

```typescript
// auth-client.ts
export const authClient = await authWorkspace
	.withProviders({ sqlite: sqliteProvider })
	.create();

// blog-client.ts
import { authClient } from './auth-client';

// Use authClient in your functions
function createPost(title: string, userId: string) {
	const user = authClient.tables.users.get({ id: userId });
	if (user.status !== 'valid') throw new Error('Invalid user');

	const id = generateId();
	blogClient.tables.posts.upsert({ id, title, authorId: userId });
	return { id };
}
```

No magic dependency injection. Just regular JS imports.

## Sequential Script Execution

Multiple scripts can safely run using `await using`:

```typescript
// Script 1: Import data
{
	await using client = await blogWorkspace
		.withProviders({ sqlite: sqliteProvider })
		.create();

	client.tables.posts.upsert({ id: '1', title: 'Hello' });
	// Auto-disposed when block exits
}

// Script 2: Process data (runs after Script 1)
{
	await using client = await blogWorkspace
		.withProviders({ sqlite: sqliteProvider })
		.create();

	const posts = client.tables.posts.getAllValid();
	// Auto-disposed when block exits
}
```
