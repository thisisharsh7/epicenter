# Workspace

A workspace is a self-contained domain module with its own schema and capabilities.

## Two-Phase Initialization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   defineWorkspace()                    .create()                            │
│   ─────────────────                    ─────────                            │
│                                                                             │
│   ┌─────────────────┐                 ┌─────────────────┐                  │
│   │ Pure Definition │                 │ Runtime Client  │                  │
│   │                 │      epoch      │                 │                  │
│   │ - id (GUID)     │ ─────────────▶  │ - Data Doc      │                  │
│   │ - slug          │   capabilities  │ - Tables        │                  │
│   │ - name          │                 │ - KV            │                  │
│   │ - tables schema │                 │ - Capabilities  │                  │
│   │ - kv schema     │                 │                 │                  │
│   └─────────────────┘                 └─────────────────┘                  │
│                                                                             │
│   Static (no I/O)                     Dynamic (creates Y.Doc)               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **`defineWorkspace()`**: Pure schema definition. No I/O. Just describes the shape.
- **`.create()`**: Creates the runtime client. Connects to the Data Doc at the specified epoch.

## What is a Workspace?

Each workspace creates its own independent client:

```typescript
// Step 1: Define the workspace (pure, no I/O)
const blogWorkspace = defineWorkspace({
	id: 'abc123xyz789012', // GUID (epoch is NOT here)
	slug: 'blog',
	name: 'Blog',
	tables: { posts: { id: id(), title: text() } },
	kv: {},
});

// Step 2: Create client at a specific epoch
const blogClient = await blogWorkspace.create({
	epoch: 0, // Which Data Doc to connect to (defaults to 0)
	capabilities: { sqlite, persistence },
});

// Use the client
blogClient.tables.posts.upsert({ id: '1', title: 'Hello' });
const posts = blogClient.tables.posts.getAllValid();
```

Each workspace has:

- **id**: Globally unique identifier (GUID) for sync coordination
- **slug**: Human-readable identifier for URLs, paths, CLI commands
- **name**: Display name shown in UI
- **tables**: Schema definition for typed tables
- **kv**: Schema definition for key-value store

## The Epoch Parameter

The `epoch` determines which Data Doc to connect to.

**CRDT Safety**: The Head Doc uses a per-client MAX pattern to handle concurrent
epoch bumps safely. Each client writes their proposal to their own key; `getEpoch()`
returns `max()` of all proposals. See `../docs/README.md` for details.

```typescript
// New workspace or prototyping (epoch defaults to 0)
const client = await workspace.create({
	capabilities: { sqlite },
});

// Specific epoch (from Head Doc)
const head = createHeadDoc({ workspaceId: workspace.id });
const epoch = head.getEpoch(); // e.g., 2
const client = await workspace.create({
	epoch,
	capabilities: { sqlite },
});

// Migration: connect to multiple epochs
const oldClient = await workspace.create({ epoch: 1 });
const newClient = await workspace.create({ epoch: 2 });
// Migrate data from old to new...
```

See `../docs/README.md` for the full three-document architecture.

## What Happens in `.create()`

When you call `.create({ epoch, capabilities })`:

```
1. Create Data Doc at {id}-{epoch}
   └── Y.Doc with guid = "abc123xyz789012-0"

2. Check if schema exists in Y.Doc
   └── If not, this is a new workspace

3. Merge code schema into Y.Doc schema
   └── Tables: add new fields, update changed fields
   └── KV: add new keys, update changed keys
   └── Idempotent: same values = no-op

4. Create table and KV helpers
   └── Typed CRUD operations backed by Y.Doc

5. Run capability factories
   └── SQLite, persistence, sync, etc.

6. Return WorkspaceClient
   └── Ready to use!
```

## Writing Functions

Write regular functions that use your client:

```typescript
const client = await blogWorkspace.create({
	epoch: 0,
	capabilities: { sqlite, persistence },
});

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
const client = await blogWorkspace.create({
	epoch: 0,
	capabilities: { sqlite, persistence },
});

client.id;            // Globally unique ID for sync (e.g., 'abc123xyz789012')
client.slug;          // Human-readable slug (e.g., 'blog')
client.tables;        // YJS-backed table operations
client.kv;            // Key-value store
client.capabilities;  // Capability exports
client.ydoc;          // Underlying YJS document (Data Doc)

await client.destroy();           // Cleanup resources
await using client = await ...;   // Auto-cleanup with dispose
```

## Full Flow with Head Doc

For multi-user apps with epoch migrations:

```typescript
// 1. Get epoch from Head Doc
const head = createHeadDoc({ workspaceId: 'abc123xyz789012' });
await syncProvider.connect(head.ydoc);
const epoch = head.getEpoch();

// 2. Define workspace (can be done once, reused)
const blogWorkspace = defineWorkspace({
	id: 'abc123xyz789012',
	slug: 'blog',
	name: 'Blog',
	tables: { posts: { id: id(), title: text() } },
	kv: {},
});

// 3. Create client at that epoch
const client = await blogWorkspace.create({
	epoch,
	capabilities: { sqlite, persistence },
});

// 4. Subscribe to epoch changes (optional)
head.observeEpoch(async (newEpoch) => {
	await client.destroy();
	const newClient = await blogWorkspace.create({
		epoch: newEpoch,
		capabilities: { sqlite, persistence },
	});
	// Update your app's reference to newClient
});
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
export const authClient = await authWorkspace.create({
	epoch: 0,
	capabilities: { sqlite, persistence },
});

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
	await using client = await blogWorkspace.create({
		epoch: 0,
		capabilities: { sqlite, persistence },
	});

	client.tables.posts.upsert({ id: '1', title: 'Hello' });
	// Auto-disposed when block exits
}

// Script 2: Process data (runs after Script 1)
{
	await using client = await blogWorkspace.create({
		epoch: 0,
		capabilities: { sqlite, persistence },
	});

	const posts = client.tables.posts.getAllValid();
	// Auto-disposed when block exits
}
```

## Migration Example

Same workspace definition, different epochs:

```typescript
const workspace = defineWorkspace({
	id: 'abc123xyz789012',
	slug: 'blog',
	name: 'Blog',
	tables: { posts: { id: id(), title: text(), content: text() } },
	kv: {},
});

// Connect to old and new epochs
const oldClient = await workspace.create({ epoch: 1 });
const newClient = await workspace.create({ epoch: 2 });

// Migrate data
for (const post of oldClient.tables.posts.getAllValid()) {
	newClient.tables.posts.upsert(migratePost(post));
}

// Update Head Doc to point to new epoch
const head = createHeadDoc({ workspaceId: workspace.id });
// Use bumpEpoch() for safe concurrent migrations
// Use setOwnEpoch() to set to a specific epoch (≤ global epoch)
head.bumpEpoch(); // Safe: computes max + 1
// OR: head.setOwnEpoch(2);  // Sets own epoch to 2 (if ≤ global)

// Cleanup
await oldClient.destroy();
await newClient.destroy();
```
