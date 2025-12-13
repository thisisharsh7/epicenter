# Epicenter: YJS-First Collaborative Workspace System

A unified workspace architecture built on YJS for real-time collaboration with optional persistence and query layers.

## Core Philosophy

**YJS Document as Source of Truth**

Epicenter uses YJS documents as the single source of truth for all data. YJS provides:
- CRDT-based conflict-free merging
- Real-time collaborative editing
- Built-in undo/redo
- Efficient binary encoding

**Unified Providers for Querying and Persistence**

Providers are a unified map of capabilities that can mirror YJS data:
- **SQLite Provider**: Enables SQL queries via Drizzle ORM
- **Markdown Provider**: Persists data as human-readable markdown files
- **Custom Providers**: Build your own (vector search, full-text search, etc.)

Providers auto-sync bidirectionally with YJS. They're completely optional—you can use just YJS, just SQLite, both, or build custom providers.

**Pure JSON Column Schemas**

Column definitions are plain JSON objects, not builder functions. This enables:
- Serialization for MCP/OpenAPI
- Runtime introspection
- Type-safe conversions to validation schemas

## Quick Start

### Installation

```bash
bun add @epicenter/hq
```

### Basic Example

```typescript
import {
  defineWorkspace,
  createWorkspaceClient,
  id,
  text,
  integer,
  boolean,
  date,
  select,
  sqliteProvider,
  markdownProvider,
} from '@epicenter/hq';
import { setupPersistence } from '@epicenter/hq/providers/persistence';
import { type } from 'arktype';

// 1. Define your workspace
const blogWorkspace = defineWorkspace({
  id: 'blog',

  tables: {
    posts: {
      id: id(),
      title: text(),
      content: text({ nullable: true }),
      category: select({ options: ['tech', 'personal'] }),
      published: boolean({ default: false }),
      views: integer({ default: 0 }),
      publishedAt: date({ nullable: true }),
    }
  },

  providers: {
    // Optional: Add YJS persistence (IndexedDB in browser, filesystem in Node.js)
    persistence: setupPersistence,
    // Optional: Add SQLite for SQL queries
    sqlite: (c) => sqliteProvider(c),
    // Optional: Add markdown for file-based persistence
    markdown: (c) => markdownProvider(c),
  },

  exports: ({ tables, providers }) => ({
    createPost: defineMutation({
      input: type({
        title: 'string',
        'category?': '"tech" | "personal"',
      }),
      handler: ({ title, category }) => {
        const id = generateId();
        tables.posts.upsert({
          id,
          title,
          content: null,
          category: category ?? 'tech',
          published: false,
          views: 0,
          publishedAt: null,
        });

        return Ok({ id });
      }
    }),

    getPublishedPosts: defineQuery({
      handler: async () => {
        // Query the SQLite provider with Drizzle
        return await providers.sqlite.posts
          .select()
          .where(eq(providers.sqlite.posts.published, true))
          .orderBy(desc(providers.sqlite.posts.publishedAt));
      }
    }),
  }),
});

// 2. Initialize the workspace client
// Node.js: async initialization (await required)
const client = await createWorkspaceClient(blogWorkspace);
// Browser: sync initialization (no await, use client.whenSynced for deferred sync)

// 3. Use the workspace
const result = await client.createPost({ title: 'Hello World' });
if (result.error) {
  console.error('Failed to create post:', result.error);
} else {
  console.log('Created post:', result.data.id);
}

// 4. Query via table operations
const allPosts = client.tables.posts.getAll();
console.log('All posts:', allPosts);

// 5. Query published posts (uses SQLite provider)
const published = await client.getPublishedPosts();
console.log('Published:', published);

// 6. Cleanup when done
await client.destroy();
```

## Core Concepts

### Workspaces

A workspace is a self-contained module with:
- **Tables**: Table definitions with column types
- **Providers**: Unified map of capabilities including persistence, sync, and materializers (SQLite, markdown, custom)
- **Exports**: Actions and utilities for interacting with the workspace

Workspaces can depend on other workspaces, creating a graph of interconnected modules.

### YJS Document

Every workspace has a YJS document that stores all table data. The YJS document:
- Is the source of truth for all data
- Supports real-time collaboration
- Provides CRDT-based conflict resolution
- Enables undo/redo
- Can be persisted to disk or IndexedDB

### Tables

Tables are defined as column schemas (pure JSON):

```typescript
tables: {
  posts: {
    id: id(),                           // Auto-generated ID (always required)
    title: text(),                      // NOT NULL by default
    content: text({ nullable: true }), // Explicitly nullable
    views: integer({ default: 0 }),    // NOT NULL with default
  }
}
```

At runtime, tables become YJS-backed collections with CRUD operations:

```typescript
tables.posts.upsert({ id: '1', title: 'Hello', ... })
tables.posts.get({ id: '1' })
tables.posts.update({ id: '1', views: 100 })
tables.posts.delete({ id: '1' })
```

### Providers

Providers are a unified map of capabilities including persistence, sync, and materializers (SQLite, markdown):

```typescript
providers: {
  persistence: setupPersistence,           // YJS persistence
  sqlite: (c) => sqliteProvider(c),        // SQL queries via Drizzle ORM
  markdown: (c) => markdownProvider(c),    // File-based persistence
}
```

Materializer providers (sqlite, markdown) automatically sync with YJS:
- **Write to YJS** → Providers auto-update
- **Pull from provider** → Replaces YJS data
- **Push to provider** → Replaces provider data

Access provider exports in workspace actions:

```typescript
exports: ({ providers }) => ({
  queryPosts: defineQuery({
    handler: async () => {
      return await providers.sqlite.posts.select().where(...);
    }
  })
})
```

Provider functions receive a context object with `{ id, ydoc, storageDir, tables }` and can return exports. For example, sync providers:

```typescript
providers: {
  persistence: setupPersistence,
  sqlite: (c) => sqliteProvider(c),

  // WebSocket sync (y-websocket protocol)
  sync: createWebsocketSyncProvider({
    url: 'ws://localhost:3913/sync',
  }),
}
```

### Actions

Actions are workspace operations defined with `defineQuery` (read) or `defineMutation` (write):

```typescript
exports: ({ tables }) => ({
  getPost: defineQuery({
    input: type({ id: 'string' }),
    handler: ({ id }) => {
      return tables.posts.get({ id });
    }
  }),

  createPost: defineMutation({
    input: type({ title: 'string' }),
    handler: ({ title }) => {
      tables.posts.upsert({ ... });
    }
  })
})
```

Actions can be exposed via MCP servers or HTTP APIs.

## Column Types

All columns support `nullable` (default: `false`) and `default` options.

### `id()`

Auto-generated primary key. Always required, always NOT NULL.

```typescript
id: id()
```

### `text(options?)`

Text column.

```typescript
name: text()                        // NOT NULL
bio: text({ nullable: true })      // Nullable
role: text({ default: 'user' })    // NOT NULL with default
```

### `ytext(options?)`

Collaborative text editor column using Y.Text. Supports inline formatting and is ideal for code editors (Monaco, CodeMirror) or simple rich text (Quill).

```typescript
code: ytext()                       // Collaborative code editor
notes: ytext({ nullable: true })   // Optional collaborative text
```

### `integer(options?)`, `real(options?)`

Numeric columns.

```typescript
age: integer()
price: real({ default: 0.0 })
score: integer({ nullable: true })
```

### `boolean(options?)`

Boolean column.

```typescript
published: boolean({ default: false })
verified: boolean({ nullable: true })
```

### `date(options?)`

Date with timezone support using custom `DateWithTimezone` type.

```typescript
createdAt: date()
publishedAt: date({ nullable: true })
```

Create dates with timezone:

```typescript
import { DateWithTimezone } from '@epicenter/hq';

const now = DateWithTimezone({
  date: new Date(),
  timezone: 'America/New_York'
});
```

### `select(options)`

Single choice from predefined options.

```typescript
status: select({
  options: ['draft', 'published', 'archived']
})

priority: select({
  options: ['low', 'medium', 'high'],
  default: 'medium'
})

visibility: select({
  options: ['public', 'private'],
  nullable: true
})
```

### `tags(options?)`

Array of strings with optional validation.

```typescript
// Unconstrained (any string array)
tags: tags()
freeTags: tags({ nullable: true })

// Constrained (validated against options)
categories: tags({
  options: ['tech', 'personal', 'work']
})
```

### `json(options)`

JSON column with arktype schema validation.

**Important**: When used in action inputs, schemas are converted to JSON Schema for MCP/OpenAPI. Avoid:
- Transforms: `.pipe()` (arktype), `.transform()` (Zod)
- Custom validation: `.filter()` (arktype), `.refine()` (Zod)
- Use `.matching(regex)` for patterns

```typescript
import { json } from '@epicenter/hq';
import { type } from 'arktype';

metadata: json({
  schema: type({
    key: 'string',
    value: 'string'
  })
})

preferences: json({
  schema: type({
    theme: 'string',
    notifications: 'boolean'
  }),
  nullable: true,
  default: { theme: 'dark', notifications: true }
})
```

## Table Operations

All table operations are accessed via `tables.{tableName}`.

### Upsert Operations

**`upsert(row)`**

Insert or update a row. Never fails. This is the primary way to write data.

For Y.js columns (ytext, tags), provide plain values:
- ytext: provide strings
- tags: provide arrays

```typescript
tables.posts.upsert({
  id: generateId(),
  title: 'Hello World',
  content: 'Post content here', // For ytext column, pass string
  tags: ['tech', 'blog'],       // For tags column, pass array
  published: false,
});
```

**`upsertMany(rows)`**

Insert or update multiple rows. Never fails.

### Update Operations

**`update(partialRow)`**

Update specific fields of an existing row. **If the row doesn't exist locally, this is a no-op.**

This is intentional: Y.js uses Last-Writer-Wins at the key level when setting a Y.Map. Creating a new Y.Map for a missing row could overwrite an existing row from another peer, causing data loss.

For Y.js columns, pass plain values and they'll be synced to existing Y.Text/Y.Array.

```typescript
tables.posts.update({
  id: '1',
  title: 'New Title',
  tags: ['updated', 'tags'], // Syncs to existing Y.Array
});
```

**`updateMany(partialRows)`**

Update multiple rows. Rows that don't exist locally are skipped (see `update` for rationale).

### Read Operations

**`get({ id })`**

Get a row by ID. Returns a discriminated union with status:
- `{ status: 'valid', row }` - Row exists and passes validation
- `{ status: 'invalid', id, error }` - Row exists but fails validation
- `{ status: 'not_found', id }` - Row doesn't exist

Returns Y.js objects for collaborative editing:
- ytext columns: Y.Text instances
- tags columns: Y.Array instances

```typescript
const result = tables.posts.get({ id: '1' });
switch (result.status) {
  case 'valid':
    console.log('Row:', result.row);
    const ytext = result.row.content; // Y.Text instance
    break;
  case 'invalid':
    console.error('Validation error:', result.error.context.summary);
    break;
  case 'not_found':
    console.log('Not found:', result.id);
    break;
}
```

**`getAll()`**

Get all rows with their validation status. Returns `RowResult<Row>[]`.

```typescript
const results = tables.posts.getAll();
for (const result of results) {
  if (result.status === 'valid') {
    console.log(result.row.title);
  } else {
    console.log('Invalid row:', result.id);
  }
}
```

**`getAllValid()`**

Get all valid rows. Skips invalid rows that fail validation.

```typescript
const posts = tables.posts.getAllValid(); // Row[]
```

**`getAllInvalid()`**

Get validation errors for all invalid rows.

```typescript
const errors = tables.posts.getAllInvalid(); // RowValidationError[]
```

**`has({ id })`**

Check if a row exists.

```typescript
const exists = tables.posts.has({ id: '1' }); // boolean
```

**`count()`**

Get total row count.

```typescript
const total = tables.posts.count(); // number
```

**`filter(predicate)`**

Filter valid rows by predicate. Invalid rows are skipped.

```typescript
const published = tables.posts.filter(row => row.published);
```

**`find(predicate)`**

Find first valid row matching predicate. Returns `Row | null`.

```typescript
const first = tables.posts.find(row => row.published);
```

### Delete Operations

**`delete({ id })`**

Delete a row.

```typescript
tables.posts.delete({ id: '1' });
```

**`deleteMany({ ids })`**

Delete multiple rows.

```typescript
tables.posts.deleteMany({ ids: ['1', '2', '3'] });
```

**`clear()`**

Delete all rows.

```typescript
tables.posts.clear();
```

### Reactive Updates

**`observe({ onAdd?, onUpdate?, onDelete? })`**

Watch for real-time changes. Returns unsubscribe function.

Callbacks receive `Result` types with validation errors:

```typescript
const unsubscribe = tables.posts.observe({
  onAdd: (result) => {
    if (result.error) {
      console.error('Invalid row added:', result.error);
    } else {
      console.log('New post:', result.data);
    }
  },
  onUpdate: (result) => {
    if (result.error) {
      console.error('Invalid row updated:', result.error);
    } else {
      console.log('Post updated:', result.data);
    }
  },
  onDelete: (id) => {
    console.log('Post deleted:', id);
  },
});

// Stop watching
unsubscribe();
```

**How it works:**
- `onAdd`: Fires when a new row Y.Map is added to the table
- `onUpdate`: Fires when any field changes within an existing row (add/modify/delete fields, edit Y.Text, modify Y.Array)
- `onDelete`: Fires when a row Y.Map is removed from the table

## Provider System

Providers are a unified map of capabilities. All workspace capabilities (persistence, sync, materializers like SQLite/markdown) are defined in a single `providers` map.

### SQLite Provider

The SQLite provider provides SQL query capabilities via Drizzle ORM.

**Setup:**

```typescript
import { sqliteProvider } from '@epicenter/hq';

providers: {
  sqlite: (c) => sqliteProvider(c)
}
```

**Storage:**
- Database: `.epicenter/{workspaceId}.db`
- Logs: `.epicenter/{workspaceId}/sqlite.log`

**Exports:**

```typescript
{
  pullToSqlite: Query,              // Sync YJS → SQLite (replace all)
  pushFromSqlite: Query,            // Sync SQLite → YJS (replace all)
  db: BetterSQLite3Database,       // Drizzle database instance
  posts: DrizzleTable,              // Each table as Drizzle table reference
  users: DrizzleTable,
  // ... all tables
}
```

**Usage:**

```typescript
exports: ({ providers }) => ({
  getPublishedPosts: defineQuery({
    handler: async () => {
      // Query with full Drizzle power
      return await providers.sqlite.posts
        .select()
        .where(eq(providers.sqlite.posts.published, true))
        .orderBy(desc(providers.sqlite.posts.publishedAt))
        .limit(10);
    }
  }),

  getPostStats: defineQuery({
    handler: async () => {
      return await providers.sqlite.posts
        .select({
          category: providers.sqlite.posts.category,
          total: count(),
          avgViews: avg(providers.sqlite.posts.views),
        })
        .groupBy(providers.sqlite.posts.category);
    }
  }),

  // Manual sync operations
  syncToSqlite: providers.sqlite.pullToSqlite,
  syncFromSqlite: providers.sqlite.pushFromSqlite,
})
```

**How it works:**
- Observes YJS changes and updates SQLite automatically
- Uses WAL mode for concurrent access
- Prevents infinite loops with sync coordination flags
- Logs validation errors without blocking sync
- Performs full initial sync on startup

### Markdown Provider

The markdown provider persists data as human-readable markdown files.

**Setup:**

```typescript
import { markdownProvider } from '@epicenter/hq';

providers: {
  markdown: (c) => markdownProvider(c, {
    directory: './data',  // Optional: workspace-level directory
    tableConfigs: {
      posts: {
        directory: './posts',  // Optional: per-table directory
        serialize: ({ row }) => ({
          frontmatter: { title: row.title, published: row.published },
          body: row.content,
          filename: `${row.id}.md`
        }),
        deserialize: ({ frontmatter, body, filename }) => {
          const id = basename(filename, '.md');
          return Ok({ id, content: body, ...frontmatter });
        }
      }
    }
  })
}
```

**Storage:**
- Markdown files: `./{workspaceId}/{tableName}/*.md` (configurable)
- Logs: `.epicenter/{workspaceId}/markdown.log`
- Diagnostics: `.epicenter/{workspaceId}/markdown.diagnostics.json`

**Exports:**

```typescript
{
  pullToMarkdown: Query,            // Sync YJS → Markdown files (replace all)
  pushFromMarkdown: Query,          // Sync Markdown files → YJS (replace all)
  scanForErrors: Query,             // Validate all files, rebuild diagnostics
}
```

**Usage:**

```typescript
exports: ({ providers }) => ({
  // Export markdown sync operations
  syncToMarkdown: providers.markdown.pullToMarkdown,
  syncFromMarkdown: providers.markdown.pushFromMarkdown,
  validateFiles: providers.markdown.scanForErrors,
})
```

**How it works:**
- Watches markdown directories for file changes
- Syncs changes bidirectionally with YJS
- Maintains rowId ↔ filename mapping (handles renames/deletions)
- Validates all files on startup
- Tracks errors in diagnostics (JSON) and error log (append-only)
- Prevents infinite loops with sync coordination

**Default serialization:**
- Frontmatter: All columns except content
- Body: `content` column (if exists)
- Filename: `{id}.md`

**Custom serialization:**

```typescript
serialize: ({ row, table }) => {
  // Custom logic
  return {
    frontmatter: { /* YAML frontmatter */ },
    body: 'markdown body',
    filename: 'custom-name.md'
  };
},
deserialize: ({ frontmatter, body, filename, table }) => {
  // Custom parsing
  const row = { id: '...', ... };
  return Ok(row); // or Err(MarkdownProviderErr({ ... }))
}
```

### WebSocket Sync Provider

The WebSocket sync provider enables real-time Y.Doc synchronization using the y-websocket protocol. This is the recommended sync solution for Epicenter.

**Setup:**

```typescript
import { createWebsocketSyncProvider } from '@epicenter/hq/providers/websocket-sync';

providers: {
  sync: createWebsocketSyncProvider({
    url: 'ws://localhost:3913/sync',
  })
}
```

**Server-side sync endpoint:**

The Epicenter server includes a sync endpoint at `/sync/{workspaceId}`:

```typescript
// In server.ts, sync is automatically included
const { app, client } = await createServer(config);
app.listen(3913);

// Clients connect to: ws://localhost:3913/sync/blog
```

**How it works:**

1. Client opens WebSocket to `/sync/{workspaceId}`
2. Server sends initial sync state
3. Client and server exchange updates bidirectionally
4. Server broadcasts updates to all connected clients
5. All Y.Docs converge via Yjs CRDTs

**Key properties:**
- Server is authoritative: REST API always reflects current Y.Doc state
- Standard protocol: Compatible with any y-websocket client
- Built-in awareness: User presence/cursors work out of the box
- No native modules: Pure JS, works with Bun

### Multi-Device Sync Architecture

Epicenter supports a distributed sync architecture where Y.Doc instances can be replicated across multiple devices and servers.

**Define your sync nodes:**

```typescript
// src/config/sync-nodes.ts
export const SYNC_NODES = {
  // Local devices via Tailscale
  desktop: 'ws://desktop.my-tailnet.ts.net:3913/sync',
  laptop: 'ws://laptop.my-tailnet.ts.net:3913/sync',

  // Cloud server (optional, always-on)
  cloud: 'wss://sync.myapp.com/sync',

  // Localhost (for browser connecting to local server)
  localhost: 'ws://localhost:3913/sync',
} as const;
```

**Provider strategy per device:**

| Device | Role | Connects To |
|--------|------|-------------|
| Phone browser | Client only | `desktop`, `laptop`, `cloud` |
| Laptop browser | Client | `localhost` |
| Desktop browser | Client | `localhost` |
| Laptop server | Node + Client | `desktop`, `cloud` |
| Desktop server | Node + Client | `laptop`, `cloud` |

**Multi-provider example (phone):**

```typescript
// Phone connects to ALL available sync nodes
providers: {
  syncDesktop: createWebsocketSyncProvider({ url: SYNC_NODES.desktop }),
  syncLaptop: createWebsocketSyncProvider({ url: SYNC_NODES.laptop }),
  syncCloud: createWebsocketSyncProvider({ url: SYNC_NODES.cloud }),
}
```

**Server-to-server sync:**

```typescript
// Desktop server connects to OTHER servers (not itself!)
providers: {
  syncToLaptop: createWebsocketSyncProvider({ url: SYNC_NODES.laptop }),
  syncToCloud: createWebsocketSyncProvider({ url: SYNC_NODES.cloud }),
}
```

Yjs supports multiple providers simultaneously. Changes merge automatically via CRDTs regardless of which provider delivers them first.

See [SYNC_ARCHITECTURE.md](./SYNC_ARCHITECTURE.md) for complete multi-device sync documentation.

## Workspace Dependencies

Workspaces can depend on other workspaces, enabling modular architecture.

**Define dependencies:**

```typescript
import authWorkspace from './auth/auth.workspace';
import storageWorkspace from './storage/storage.workspace';

const blogWorkspace = defineWorkspace({
  id: 'blog',
  dependencies: [authWorkspace, storageWorkspace],

  exports: ({ tables, workspaces, providers }) => ({
    createPost: defineMutation({
      input: type({ title: 'string', authorId: 'string' }),
      handler: async ({ title, authorId }) => {
        // Access dependency workspace actions
        const user = await workspaces.auth.getUserById({ id: authorId });
        if (!user) {
          return Err({ message: 'User not found' });
        }

        // Access dependency workspace tables
        const allUsers = workspaces.auth.tables.users.getAll();

        // Create post in local workspace
        const id = generateId();
        tables.posts.upsert({
          id,
          title,
          authorId,
          published: false,
        });
        return Ok({ id });
      }
    })
  })
});
```

**Access patterns:**

```typescript
exports: ({ workspaces }) => ({
  // Call dependency actions
  someAction: async () => {
    const result = await workspaces.auth.login({ ... });
    const data = await workspaces.storage.upload({ ... });
  },

  // Access dependency tables
  anotherAction: () => {
    const users = workspaces.auth.tables.users.getAll();
  },

  // Access dependency providers
  yetAnother: async () => {
    const rows = await workspaces.auth.providers.sqlite.users
      .select()
      .where(...);
  }
})
```

**Dependency resolution:**

Epicenter uses flat/hoisted dependency resolution:
- All transitive dependencies must be in the root `workspaces` array
- Dependencies are initialized in topological order
- Circular dependencies are detected and throw errors

```typescript
// If A depends on B, and B depends on C:
const epicenter = await createEpicenterClient({
  workspaces: [C, B, A]  // All must be listed (flat/hoisted)
});
```

## Actions

Actions are workspace operations defined with `defineQuery` or `defineMutation`.

### Query Actions

Read operations with no side effects. Use HTTP GET when exposed via API/MCP.

**Variants:**

```typescript
// With input, returns Result<T, E>
defineQuery({
  input: type({ id: 'string' }),
  handler: ({ id }) => {
    const post = db.tables.posts.get({ id });
    if (!post) {
      return Err({ message: 'Not found' });
    }
    return Ok(post.data);
  }
})

// With input, returns T (can't fail)
defineQuery({
  input: type({ limit: 'number' }),
  handler: ({ limit }) => {
    return db.tables.posts.getAll().slice(0, limit);
  }
})

// No input, returns Result<T, E>
defineQuery({
  handler: () => {
    const result = someOperationThatCanFail();
    if (result.error) {
      return Err(result.error);
    }
    return Ok(result.data);
  }
})

// No input, returns T (can't fail)
defineQuery({
  handler: () => {
    return db.tables.posts.count();
  }
})
```

All variants support async handlers:

```typescript
defineQuery({
  input: type({ id: 'string' }),
  handler: async ({ id }) => {
    const data = await fetchExternal(id);
    return Ok(data);
  }
})
```

### Mutation Actions

Write operations that modify state. Use HTTP POST when exposed via API/MCP.

**Variants:** Same as queries (8 overloads: with/without input, sync/async, Result/raw).

```typescript
// With input, returns Result<T, E>
defineMutation({
  input: type({ title: 'string' }),
  handler: ({ title }) => {
    const id = generateId();
    db.tables.posts.upsert({
      id,
      title,
      published: false,
    });
    return Ok({ id });
  }
})

// With input, returns void (can't fail)
defineMutation({
  input: type({ id: 'string' }),
  handler: ({ id }) => {
    db.tables.posts.delete({ id });
  }
})
```

### Input Validation

Actions support Standard Schema validation (ArkType, Zod, Valibot, Effect):

```typescript
import { type } from 'arktype';
import { z } from 'zod';

// ArkType (recommended)
defineQuery({
  input: type({
    email: 'string.email',
    age: 'number>0',
  }),
  handler: (input) => { ... }
})

// Zod
defineQuery({
  input: z.object({
    email: z.string().email(),
    age: z.number().positive(),
  }),
  handler: (input) => { ... }
})
```

**JSON Schema Limitations:**

Input schemas are converted to JSON Schema for MCP/CLI/OpenAPI. Avoid:
- Transforms: `.pipe()` (ArkType), `.transform()` (Zod)
- Custom validation: `.filter()` (ArkType), `.refine()` (Zod)
- Non-JSON types: `bigint`, `symbol`, `undefined`, `Date`, `Map`, `Set`

Use basic types and `.matching(regex)` for patterns. For complex validation, validate in the handler.

### Action Properties

Actions have metadata properties:

```typescript
const action = defineQuery({ ... });

action.type         // 'query' | 'mutation'
action.input        // StandardSchemaV1 | undefined
action.description  // string | undefined
```

### Type Guards

```typescript
import { isAction, isQuery, isMutation } from '@epicenter/hq';

isAction(value)    // value is Query | Mutation
isQuery(value)     // value is Query
isMutation(value)  // value is Mutation
```

### Extract Actions

Filter workspace exports to just actions:

```typescript
import { extractActions } from '@epicenter/hq';

const actions = extractActions(workspaceExports);
// { actionName: Query | Mutation, ... }
```

Useful for API/MCP mapping. Non-action exports (utilities, constants) are filtered out.

## Providers

Providers are defined as a map and can attach capabilities to YJS documents. They run in parallel during workspace initialization.

**Type:**

```typescript
type Provider<TExports> = (context: ProviderContext) => TExports | void | Promise<TExports | void>;

type ProviderContext = {
  id: string;                          // Workspace ID
  ydoc: Y.Doc;                         // YJS document
  storageDir: AbsolutePath | undefined; // Node.js: absolute path, Browser: undefined
  tables: Tables<TSchema>;             // Access to workspace tables
};
```

**Common providers:**

```typescript
import { setupPersistence } from '@epicenter/hq/providers/persistence';
import { sqliteProvider, markdownProvider } from '@epicenter/hq';
import { createWebsocketSyncProvider } from '@epicenter/hq/providers/websocket-sync';

providers: {
  // Filesystem persistence (Node.js) or IndexedDB (browser)
  persistence: setupPersistence,

  // SQLite materializer
  sqlite: (c) => sqliteProvider(c),

  // Markdown materializer
  markdown: (c) => markdownProvider(c),

  // WebSocket sync provider (y-websocket protocol)
  sync: createWebsocketSyncProvider({
    url: 'ws://localhost:3913/sync',
  }),

  // Custom provider
  custom: ({ id, ydoc, storageDir }) => {
    console.log(`Setting up workspace: ${id}`);
    // Attach custom capabilities
  },
}
```

**Execution:**

Providers run in parallel during initialization. Providers that return exports make those exports available in the `providers` object passed to the `exports` function.

## Runtime

### Browser vs Node.js Initialization

Epicenter has different initialization patterns for browser and Node.js environments:

| Environment | `createWorkspaceClient` / `createEpicenterClient` | `whenSynced` |
|-------------|---------------------------------------------------|--------------|
| **Node.js** | Async (returns Promise) | Not needed |
| **Browser** | Synchronous (returns immediately) | Available on each workspace client |

**Why the difference?** Browser modules can't use top-level await effectively. The client needs to be exportable and importable like any other value. Node.js supports top-level await, so full initialization can happen at the entry point.

See [Synchronous Client Initialization](/docs/articles/sync-client-initialization.md) for the full rationale.

### Create Workspace Client

Initialize a single workspace:

**Node.js:**
```typescript
import { createWorkspaceClient } from '@epicenter/hq';

const client = await createWorkspaceClient(workspace);

// Access exports
await client.createPost({ title: 'Hello' });
const posts = client.db.tables.posts.getAll();

// Cleanup
await client.destroy();

// Or use with `await using` for automatic cleanup
await using workspace = await createWorkspaceClient(workspace);
```

**Browser:**
```typescript
import { createWorkspaceClient } from '@epicenter/hq';

// Synchronous - no await needed
const client = createWorkspaceClient(workspace);

// Client is usable immediately
client.createPost({ title: 'Hello' });

// Wait for providers to sync if needed
await client.whenSynced;
```

**storageDir:** Defaults to `process.cwd()` in Node.js, `undefined` in browser.

### Create Epicenter Client

Initialize multiple workspaces:

**Node.js:**
```typescript
import { createEpicenterClient, defineEpicenter } from '@epicenter/hq';

const epicenter = defineEpicenter({
  storageDir: '/path/to/storage',  // Optional
  workspaces: [blogWorkspace, authWorkspace, storageWorkspace],
});

const client = await createEpicenterClient(epicenter);

// Access workspaces by ID
await client.blog.createPost({ ... });
await client.auth.login({ ... });
const files = await client.storage.listFiles();

// Cleanup
await client.destroy();
```

**Browser:**
```typescript
// Synchronous - no await needed
const client = createEpicenterClient(epicenter);

// Client is usable immediately
client.blog.getAllPosts();

// Wait for individual workspace providers to sync
await client.blog.whenSynced;

// Or wait for all workspaces
await Promise.all([
  client.blog.whenSynced,
  client.auth.whenSynced,
]);
```

**Workspace clients:**

Each workspace in the client object is a `WorkspaceClient<TExports>` with:
- All exports from the workspace
- `destroy()` and `Symbol.asyncDispose` for cleanup
- `whenSynced` (browser only) - Promise that resolves when all providers are synced

## API Reference

### Workspace Definition

```typescript
import {
  defineWorkspace,
  type WorkspaceConfig,
} from '@epicenter/hq';
```

**`defineWorkspace<TDeps, TId, TSchema, TProviders, TExports>(config)`**

Define a workspace with tables, providers, and exports.

Returns `WorkspaceConfig<TDeps, TId, TSchema, TProviders, TExports>`.

### Runtime Creation

```typescript
import {
  createWorkspaceClient,
  createEpicenterClient,
  defineEpicenter,
  type WorkspaceClient,
  type EpicenterClient,
} from '@epicenter/hq';
```

**`createWorkspaceClient<...>(workspace)`**

Initialize a single workspace. Returns `Promise<WorkspaceClient<TExports>>`.

**`defineEpicenter(config)`**

Define an epicenter with multiple workspaces.

**`createEpicenterClient<TConfigs>(epicenter)`**

Initialize multiple workspaces. Returns `Promise<EpicenterClient<TConfigs>>`.

### Column Schemas

```typescript
import {
  id,
  text,
  ytext,
  integer,
  real,
  boolean,
  date,
  select,
  tags,
  json,
  type ColumnSchema,
  type TableSchema,
  type WorkspaceSchema,
} from '@epicenter/hq';
```

**Column factory functions:**
- `id()`: Auto-generated ID
- `text(options?)`: Text column
- `ytext(options?)`: Collaborative text (Y.Text)
- `integer(options?)`, `real(options?)`: Numeric columns
- `boolean(options?)`: Boolean column
- `date(options?)`: Date with timezone
- `select<TOptions>(options)`: Single choice enum
- `tags<TOptions>(options?)`: String array
- `json<TSchema>(options)`: JSON with arktype validation

**Common options:**
- `nullable?: boolean` (default: `false`)
- `default?: T | (() => T)`

### Actions

```typescript
import {
  defineQuery,
  defineMutation,
  isAction,
  isQuery,
  isMutation,
  extractActions,
  defineWorkspaceExports,
  type Query,
  type Mutation,
  type Action,
  type WorkspaceActionMap,
  type WorkspaceExports,
} from '@epicenter/hq';
```

**`defineQuery(config)`**

Define a query action (read operation).

**`defineMutation(config)`**

Define a mutation action (write operation).

**Type guards:**
- `isAction(value)`: Check if value is Query or Mutation
- `isQuery(value)`: Check if value is Query
- `isMutation(value)`: Check if value is Mutation

**`extractActions(exports)`**

Filter workspace exports to just actions.

**`defineWorkspaceExports<T>(exports)`**

Identity function for type inference.

### Table Operations

```typescript
import { type Tables, type TableHelper } from '@epicenter/hq';
```

**`TableHelper<TSchema>`** methods:
- `upsert(row)`, `upsertMany(rows)`: Create or replace entire row (never fails)
- `update(partial)`, `updateMany(partials)`: Merge fields into existing row (no-op if not found)
- `get({ id })`, `getAll()`, `getAllInvalid()`
- `has({ id })`, `count()`
- `delete({ id })`, `deleteMany({ ids })`, `clear()`
- `filter(predicate)`, `find(predicate)`
- `observe({ onAdd?, onUpdate?, onDelete? })`

### Providers

```typescript
import { sqliteProvider } from '@epicenter/hq';
import { markdownProvider, type MarkdownProviderConfig } from '@epicenter/hq';
import {
  type Provider,
  type ProviderContext,
  type ProviderExports,
  type WorkspaceProviderMap,
} from '@epicenter/hq';
```

**`sqliteProvider(context)`**

Create SQLite provider with Drizzle ORM.

**`markdownProvider(context, config?)`**

Create markdown file provider.

### Persistence Provider

```typescript
import { setupPersistence } from '@epicenter/hq/providers/persistence';
```

**`setupPersistence`**

Built-in persistence provider (IndexedDB in browser, filesystem in Node.js).

### Date Utilities

```typescript
import {
  DateWithTimezone,
  DateWithTimezoneFromString,
  isDateWithTimezone,
  isDateWithTimezoneString,
  type DateWithTimezoneString,
  type DateIsoString,
  type TimezoneId,
} from '@epicenter/hq';
```

**`DateWithTimezone({ date, timezone })`**

Create a date with timezone.

**`DateWithTimezoneFromString(str)`**

Parse from string (format: `{iso}[{timezone}]`).

### Validation

```typescript
import {
  createTableValidators,
  createWorkspaceValidators,
  type TableValidators,
  type WorkspaceValidators,
} from '@epicenter/hq';
```

**`createTableValidators<TSchema>(schema)`**

Create validators for a table schema.

**`createWorkspaceValidators<TSchema>(schema)`**

Create validators for all tables in a workspace.

### Error Types

```typescript
import {
  EpicenterOperationErr,
  IndexErr,
  ValidationErr,
  type EpicenterOperationError,
  type IndexError,
  type ValidationError,
} from '@epicenter/hq';
```

**Error constructors:**
- `EpicenterOperationErr({ message, context, cause })`: General operation errors
- `IndexErr({ message, context, cause })`: Index sync errors
- `ValidationErr({ message, context, cause })`: Schema validation errors

### Drizzle Re-exports

```typescript
import {
  eq, ne, gt, gte, lt, lte,
  and, or, not,
  like, inArray,
  isNull, isNotNull,
  sql, desc, asc,
} from '@epicenter/hq';
```

Commonly used Drizzle operators for querying SQLite provider.

### Server

```typescript
import { createServer } from '@epicenter/hq';
```

**`createServer(epicenter)`**

Create HTTP server exposing workspaces as REST API and MCP servers.

## MCP Integration

Epicenter workspaces can be exposed as MCP (Model Context Protocol) servers for AI assistant integration.

### HTTP Transport Only

Epicenter uses HTTP transport exclusively, not stdio. This is intentional:

**Why not stdio?**

stdio spawns a new process per AI session, which creates problems:
- Expensive cold starts (initialize YJS, build providers, parse files)
- File system conflicts (multiple watchers, SQLite locks)
- No shared state (wasted memory, duplicate work)

**Why HTTP?**

A long-running HTTP server models Epicenter's folder-based architecture:
- Initialize once, serve many sessions
- Share state across all AI assistants
- Handle file watching without conflicts
- Efficient resource usage

### Route Handling

Workspace actions are exposed via REST endpoints under the `/workspaces` prefix:

**Query Actions** (HTTP GET):
- Path: `/workspaces/{workspaceId}/{actionName}`
- Input: Query string parameters

**Mutation Actions** (HTTP POST):
- Path: `/workspaces/{workspaceId}/{actionName}`
- Input: JSON request body

**URL Hierarchy:**
```
/                                    - API root/discovery
/openapi                             - OpenAPI spec (JSON)
/scalar                              - Scalar UI documentation
/mcp                                 - MCP endpoint
/signaling                           - WebRTC signaling WebSocket
/workspaces/{workspaceId}/{action}   - Workspace actions
```

### Setup

```typescript
import { createServer } from '@epicenter/hq';

const epicenter = defineEpicenter({
  workspaces: [blogWorkspace, authWorkspace],
});

const server = createServer(epicenter);

// Start server
await server.listen({ port: 3000 });
console.log('Server running on http://localhost:3000');
```

AI assistants connect via HTTP, with no cold start penalty.

## Contributing

### Local Development

If you're working on the Epicenter package, test it locally using `bun link`:

```bash
# Install dependencies (from repository root)
bun install

# One-time setup: Link the package globally
cd packages/epicenter
bun link

# Now use from any directory
cd examples/content-hub
epicenter --help
epicenter blog createPost --title "Test"

# When done testing
cd packages/epicenter
bun unlink
```

**Alternative:** Use local `cli.ts` in examples:

```bash
cd examples/content-hub
bun cli.ts --help
bun cli.ts blog createPost --title "Test"
```

### Running Tests

```bash
# Run all tests
bun test

# Run specific workspace tests
cd examples/content-hub
bun test
```

### More Information

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for complete development setup and guidelines.

## License

AGPL-3.0
