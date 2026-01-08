# Y.Doc Wrappers: 3-Document Architecture

This module provides typed wrappers for the three Y.Doc types that power collaborative workspaces.

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
│    └── name: "My Workspace"                                      │
│                                                                  │
│  Y.Map('schema')                                                 │
│    ├── tables: Y.Map<tableName, Y.Map<fieldName, FieldSchema>>   │
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
// 1. Get registryId from auth server
const registryId = authServer.getRegistryId(userId);

// 2. Connect to Registry to discover workspaces
const registry = createRegistryDoc({ registryId });
const workspaceIds = registry.getWorkspaceIds();

// 3. User selects a workspace, connect to Head
const head = createHeadDoc({ workspaceId });
const epoch = head.getEpoch();

// 4. Connect to Data doc at current epoch
const data = createDataDoc({ workspaceId, epoch });

// 5. Subscribe to epoch changes for reconnection
head.observeEpoch((newEpoch) => {
	// Reconnect to new Data doc
	const newData = createDataDoc({ workspaceId, epoch: newEpoch });
});
```

## Epoch System

Epochs enable atomic migrations and compaction:

```
Epoch 0: Initial data
    │
    │ Schema migration needed
    ▼
Epoch 1: Migrated data (new schema)
    │
    │ Compaction needed
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
// Code defines schema
const workspace = defineWorkspace({
	tables: {
		posts: { id: id(), title: text(), published: boolean() },
	},
});

// On create(), schema is merged into Y.Doc
const client = await workspace.create();
// Internally: dataDoc.mergeSchema(tables, kv)
```

**Merge rules:**

- Field doesn't exist → add it
- Field exists with different value → update it
- Field exists with same value → no-op (CRDT handles)

This is idempotent and safe for concurrent calls.

## Files

| File              | Factory               | Purpose                  |
| ----------------- | --------------------- | ------------------------ |
| `registry-doc.ts` | `createRegistryDoc()` | Personal workspace index |
| `head-doc.ts`     | `createHeadDoc()`     | Epoch pointer            |
| `data-doc.ts`     | `createDataDoc()`     | Schema + data storage    |

## SerializedFieldSchema

The Y.Doc stores a subset of `FieldSchema` to save space:

```typescript
// Full FieldSchema (from factories)
{ type: 'text', name: '', description: '', icon: null, nullable: true }

// SerializedFieldSchema (stored in Y.Doc)
{ type: 'text', nullable: true }
```

`FieldMetadata` (name, description, icon) is stripped because:

1. Nobody actually uses it (all call sites pass empty/null)
2. It would bloat every field in the Y.Doc
3. TypeScript types come from code schema anyway

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
data.mergeSchema(tables, kv);
```
