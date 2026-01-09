# Y.Doc Architecture: Three Documents, One Client

This module provides typed wrappers for the three Y.Doc types that power collaborative workspaces.

## Summary: The Three-Fetch Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   STEP 1               STEP 2                STEP 3                         │
│   Registry Doc         Head Doc              Data Doc                       │
│   ────────────         ────────              ────────                       │
│                                                                             │
│   ┌───────────┐       ┌───────────┐        ┌───────────────────┐           │
│   │ workspaces│       │   epoch   │        │ schema + tables   │           │
│   │  - abc123 │       │     2     │        │ + kv + metadata   │           │
│   │  - xyz789 │       │           │        │                   │           │
│   └─────┬─────┘       └─────┬─────┘        └─────────┬─────────┘           │
│         │                   │                        │                      │
│         ▼                   ▼                        ▼                      │
│                                                                             │
│      GUID            +   EPOCH         =      DATA DOC ID                   │
│    "abc123"               2                   "abc123-2"                    │
│                                                                             │
│   ───────────────────────────────────────────────────────────────────────  │
│                                                                             │
│   Fetch GUID          Fetch version         Create WorkspaceClient          │
│   from Registry       from Head Doc         with Data Doc                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**The pattern:** Three Y.Docs, each providing one piece of information needed to create a client.

| Step | Document | Fetches                | Y.Doc GUID              |
| ---- | -------- | ---------------------- | ----------------------- |
| 1    | Registry | GUID (workspace ID)    | `{registryId}`          |
| 2    | Head     | Epoch (version number) | `{workspaceId}`         |
| 3    | Data     | Schema + Data          | `{workspaceId}-{epoch}` |

## Why Three Documents?

A single Y.Doc per workspace seems simpler, but creates problems:

1. **Different sync scopes**: Registry syncs only to YOUR devices; workspace data syncs to ALL collaborators
2. **Epoch migrations**: Bumping epochs requires a stable pointer (Head) separate from data (Data)
3. **Discovery**: Users need to know which workspaces they have access to before loading them

## Document Types

```
┌─────────────────────────────────────────────────────────────────┐
│  REGISTRY Y.Doc                                                  │
│  ID: {registryId}                                                │
│  Scope: Personal (syncs across user's own devices only)          │
│                                                                  │
│  Y.Map('workspaces')                                             │
│    └── {workspaceId}: true                                       │
│                                                                  │
│  Purpose: "Which workspaces do I have access to?"                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ User picks a workspace
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  HEAD Y.Doc                                                      │
│  ID: {workspaceId}                                               │
│  Scope: Shared (syncs with all workspace collaborators)          │
│                                                                  │
│  Y.Map('head')                                                   │
│    └── epoch: 0                                                  │
│                                                                  │
│  Purpose: "What's the current data epoch?"                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Read epoch, compute Data doc ID
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  DATA Y.Doc                                                      │
│  ID: {workspaceId}-{epoch}                                       │
│  Scope: Shared (syncs with all workspace collaborators)          │
│                                                                  │
│  Y.Map('meta')                                                   │
│    ├── name: "My Workspace"                                      │
│    └── slug: "my-workspace"                                      │
│                                                                  │
│  Y.Map('schema')                                                 │
│    ├── tables: Y.Map<tableName, {                                │
│    │     name: string,                                           │
│    │     icon: IconDefinition | null,                            │
│    │     cover: CoverDefinition | null,                          │
│    │     description: string,                                    │
│    │     fields: Y.Map<fieldName, FieldSchema>                   │
│    │   }>                                                        │
│    └── kv: Y.Map<keyName, FieldSchema>                           │
│                                                                  │
│  Y.Map('tables')                                                 │
│    └── {tableName}: Y.Map<rowId, Y.Map<fieldName, value>>        │
│                                                                  │
│  Y.Map('kv')                                                     │
│    └── {keyName}: value                                          │
│                                                                  │
│  Purpose: "All the actual workspace data"                        │
└─────────────────────────────────────────────────────────────────┘
```

## Boot Flow

```typescript
// ═══════════════════════════════════════════════════════════════
// STEP 1: Registry Doc - Get GUID
// ═══════════════════════════════════════════════════════════════
const registryId = authServer.getRegistryId(userId);
const registry = createRegistryDoc({ registryId });
await syncProvider.connect(registry.ydoc); // Sync with user's devices

const workspaceIds = registry.getWorkspaceIds();
// → ['abc123', 'xyz789']

// User selects a workspace
const workspaceId = 'abc123';

// ═══════════════════════════════════════════════════════════════
// STEP 2: Head Doc - Get Epoch
// ═══════════════════════════════════════════════════════════════
const head = createHeadDoc({ workspaceId });
await syncProvider.connect(head.ydoc); // Sync with collaborators

const epoch = head.getEpoch();
// → 2

// Optional: Subscribe to epoch changes for live migrations
head.observeEpoch((newEpoch) => {
	// Reconnect to new Data Doc when epoch bumps
});

// ═══════════════════════════════════════════════════════════════
// STEP 3: Data Doc - Create Client
// ═══════════════════════════════════════════════════════════════
const workspace = defineWorkspace({
	id: workspaceId, // GUID only (epoch passed to .create())
	slug: 'blog',
	name: 'Blog',
	tables: { posts: { id: id(), title: text() } },
	kv: {},
});

const client = await workspace.create({
	epoch, // From Head Doc (defaults to 0 if omitted)
	sqlite,
	persistence,
});

// Now you have a fully typed client
client.tables.posts.upsert({ id: '1', title: 'Hello' });
```

## Why Separate Head from Data?

Data Docs are **immutable by ID**:

- `abc123-0` is epoch 0's data
- `abc123-1` is epoch 1's data
- `abc123-2` is epoch 2's data

They're different Y.Docs with different GUIDs. You can't "upgrade" a Y.Doc in place — you create a new one.

The Head Doc is the **stable pointer**. Its GUID never changes (`abc123`), but its `epoch` value can change. When you bump epochs:

1. Create new Data Doc at `abc123-3`
2. Migrate data from epoch 2 → epoch 3
3. Update Head Doc: `epoch: 2` → `epoch: 3`
4. All clients see the epoch change and reconnect to the new Data Doc

## Epoch System

Epochs enable atomic migrations and compaction:

```
Epoch 0: Initial data
    │
    │ Schema migration needed
    ▼
Epoch 1: Migrated data (new schema)
    │
    │ Compaction needed (Y.Doc too large)
    ▼
Epoch 2: Compacted data (fresh Y.Doc)
```

**To bump epochs:**

1. Create new Data doc at `{workspaceId}-{epoch+1}`
2. Migrate/transform data from old epoch
3. Call `head.setEpoch(epoch + 1)`
4. All clients observing Head reconnect to new Data doc

## Schema Merge Semantics

When `workspace.create()` is called, the code-defined schema is merged into the Y.Doc:

```typescript
// Code defines schema (simple format)
const workspace = defineWorkspace({
	tables: {
		posts: { id: id(), title: text(), published: boolean() },
	},
});

// Or with table metadata (TablesWithMetadata format)
const workspace = defineWorkspace({
	tables: {
		posts: {
			name: 'Blog Posts',
			icon: { type: 'emoji', value: '📝' },
			cover: null,
			description: 'All blog posts',
			fields: { id: id(), title: text(), published: boolean() },
		},
	},
});

// On create(), schema is merged into Y.Doc
const client = await workspace.create();
// Internally: dataDoc.mergeSchema(tables, kv)
```

**Merge rules:**

- Table doesn't exist → add it with default metadata
- Table exists → merge metadata (name, icon, cover, description)
- Field doesn't exist → add it
- Field exists with different value → update it
- Field exists with same value → no-op (CRDT handles)

This is idempotent and safe for concurrent calls.

## Simplified Flow (Prototyping)

If you don't need multi-user sync or epoch migrations, skip Registry and Head:

```typescript
const workspace = defineWorkspace({
  id: 'my-workspace',
  slug: 'blog',
  name: 'Blog',
  tables: { ... },
  kv: {}
});

// Epoch defaults to 0
const client = await workspace.create({ sqlite });
```

## Files

| File              | Factory               | Purpose                  |
| ----------------- | --------------------- | ------------------------ |
| `registry-doc.ts` | `createRegistryDoc()` | Personal workspace index |
| `head-doc.ts`     | `createHeadDoc()`     | Epoch pointer            |
| `data-doc.ts`     | `createDataDoc()`     | Schema + data storage    |

## Schema Storage

The Y.Doc stores the full `FieldSchema` directly - no conversion needed:

```typescript
import { Type } from 'typebox';

// FieldSchema stored as-is in Y.Doc
{
  type: 'text',
  name: 'Title',
  description: 'Post title',
  icon: { type: 'emoji', value: '📝' },
  nullable: true
}

// For json fields, TypeBox schemas ARE JSON Schema - stored directly
{
  type: 'json',
  schema: Type.Object({ theme: Type.String() })  // This IS JSON Schema
}
```

**Why this works:**

1. TypeBox schemas ARE JSON Schema - no conversion needed
2. FieldSchema is fully JSON-serializable
3. Enables Notion-like collaborative schema editing (rename fields, add descriptions, set icons)
4. Changes sync via CRDT to all collaborators
5. TypeScript types come from code schema (compile-time safety)

## Usage

```typescript
import { createRegistryDoc, createHeadDoc, createDataDoc } from './docs';

// Registry (user's workspace list)
const registry = createRegistryDoc({ registryId: 'user123' });
registry.addWorkspace('workspace456');

// Head (epoch pointer)
const head = createHeadDoc({ workspaceId: 'workspace456' });
console.log(head.getEpoch()); // 0

// Data (schema + data)
const data = createDataDoc({ workspaceId: 'workspace456', epoch: 0 });

// Set workspace metadata
data.setName('My Workspace');
data.setSlug('my-workspace');

// Merge schema (accepts both TablesSchema and TablesWithMetadata)
data.mergeSchema(tables, kv);

// Get table definition including metadata
const postsDef = data.getTableDefinition('posts');
// { name: 'Blog Posts', icon: {...}, cover: null, description: '...', fields: {...} }

// Update table metadata
data.setTableMetadata('posts', {
	name: 'Updated Posts',
	icon: { type: 'emoji', value: '✍️' },
});
```
