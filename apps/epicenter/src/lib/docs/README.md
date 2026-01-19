# Three-Doc Architecture

Epicenter uses a three-document architecture for storing and retrieving workspace data. Each document type has a specific responsibility and corresponding helper function.

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         THREE-DOC ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐      ┌──────────────┐      ┌──────────────────────┐     │
│   │   REGISTRY   │ ──▶  │   HEAD DOC   │ ──▶  │    WORKSPACE DOC     │     │
│   │              │      │              │      │                      │     │
│   │  "Which      │      │  "What       │      │  "Schema + Data"     │     │
│   │   workspaces │      │   epoch?"    │      │                      │     │
│   │   exist?"    │      │              │      │                      │     │
│   └──────────────┘      └──────────────┘      └──────────────────────┘     │
│         │                     │                        │                   │
│         ▼                     ▼                        ▼                   │
│   registry.yjs          head.yjs              {epoch}/workspace.yjs        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Storage Layout

```
{appLocalDataDir}/
├── registry.yjs                    # Index of all workspace IDs
├── registry.json                   # Human-readable snapshot
└── workspaces/
    └── {workspace-id}/
        ├── head.yjs                # Current epoch pointer
        ├── head.json               # Human-readable snapshot
        │
        ├── 0/                      # Epoch 0
        │   ├── workspace.yjs       # Full Y.Doc (sync source of truth)
        │   ├── workspace.json      # Debug JSON mirror
        │   ├── definition.json     # Schema (from Y.Map('definition'))
        │   ├── kv.json             # Settings (from Y.Map('kv'))
        │   ├── tables.sqlite       # Table data (from Y.Map('tables'))
        │   └── snapshots/          # Revision history
        │       └── {unix-ms}.ysnap
        │
        └── 1/                      # Epoch 1 (after migration)
            ├── workspace.yjs
            ├── definition.json
            ├── kv.json
            ├── tables.sqlite
            └── snapshots/
                └── ...
```

### Workspace ID Format

The `id` is a **locally-scoped identifier**, not a GUID:

- **Local/Relay**: `epicenter.whispering`, `epicenter.crm`
- **Y-Sweet (with auth)**: Server combines user ID with local ID for global uniqueness

## Y.Doc Structure (Three Top-Level Maps)

Each workspace Y.Doc has three top-level Y.Maps:

```typescript
// Y.Doc guid: "{workspaceId}-{epoch}"

// Schema (rarely changes)
Y.Map('definition')
  └── name: string              // Workspace display name
  └── icon: IconDefinition | null
  └── tables: {                 // Table SCHEMAS (not data)
        [tableName]: {
          name: string,
          icon: IconDefinition | null,
          description: string,
          fields: { [fieldName]: FieldSchema }
        }
      }
  └── kv: {                     // KV SCHEMAS (not values)
        [key]: {
          name: string,
          icon: IconDefinition | null,
          description: string,
          field: FieldSchema
        }
      }

// Settings values (changes occasionally)
Y.Map('kv')
  └── [key]: value              // Actual KV values

// Table data (changes frequently)
Y.Map('tables')
  └── [tableName]: Y.Map<rowId, Y.Map<fieldName, value>>
```

### Why Three Top-Level Maps?

| Map          | Content         | Change Frequency | Persistence Target |
| ------------ | --------------- | ---------------- | ------------------ |
| `definition` | Schema metadata | Rare             | `definition.json`  |
| `kv`         | Settings values | Occasional       | `kv.json`          |
| `tables`     | Row data        | Frequent         | `tables.sqlite`    |

**Benefits:**

- 1:1 mapping between Y.Doc maps and files
- Independent observation (no `observeDeep` needed)
- Each map can have different persistence strategies
- Clean conceptual separation: schema vs settings vs data
- **Collaborative schema editing** via Y.Map('definition')

## Document Types

| Doc Type      | Purpose                            | Storage Path                                              | Helper                                     |
| ------------- | ---------------------------------- | --------------------------------------------------------- | ------------------------------------------ |
| **Registry**  | Tracks which workspace GUIDs exist | `{appLocalDataDir}/registry.yjs`                          | `registry` (module singleton)              |
| **Head Doc**  | Stores current epoch per workspace | `{appLocalDataDir}/workspaces/{id}/head.yjs`              | `createHead(workspaceId)`                  |
| **Workspace** | Schema + Data for a workspace      | `{appLocalDataDir}/workspaces/{id}/{epoch}/workspace.yjs` | `createWorkspaceClient(definition, epoch)` |

## Helper Functions

### Registry (Module Singleton)

```typescript
import { registry } from '$lib/docs/registry';

// Sync access works immediately
registry.addWorkspace('abc123');
registry.getWorkspaceIds();
registry.hasWorkspace('abc123');

// Await in UI render gate
{#await registry.whenSynced}
  <Loading />
{:then}
  {@render children()}
{/await}
```

### Head Doc (Factory Function)

```typescript
import { createHead } from '$lib/docs/head';

const head = createHead(workspaceId);
await head.whenSynced;
const epoch = head.getEpoch();
```

### Workspace Doc (Factory Function)

```typescript
import { createWorkspaceClient } from '$lib/docs/workspace';

const client = createWorkspaceClient(definition, epoch);
await client.whenSynced;

// Use the client
client.tables.myTable.upsert({ ... });

// Name is a LIVE getter from Y.Map('definition')
console.log(client.name); // "My Workspace" (from CRDT)
```

## Typical Flow

Loading an existing workspace:

```typescript
// 1. Check registry for workspace existence
await registry.whenSynced;
if (!registry.hasWorkspace(workspaceId)) {
	throw new Error('Workspace not found');
}

// 2. Get epoch from head doc
const head = createHead(workspaceId);
await head.whenSynced;
const epoch = head.getEpoch();

// 3. Create workspace client with definition + epoch
const client = createWorkspaceClient(definition, epoch);
await client.whenSynced;
```

Creating a new workspace:

```typescript
// 1. Add to registry
registry.addWorkspace(guid);

// 2. Initialize head doc (epoch starts at 0)
const head = createHead(guid);
await head.whenSynced;

// 3. Create workspace at epoch 0
const client = createWorkspaceClient(definition, 0);
await client.whenSynced;
```

## File Structure

```
$lib/docs/
├── README.md       # This file
├── registry.ts     # Module singleton for workspace registry
├── head.ts         # Factory for head docs (epoch tracking)
└── workspace.ts    # Factory for workspace clients
```

## Persistence Strategy

The unified persistence capability materializes the Y.Doc into multiple formats:

| File              | Source                | Purpose                                 |
| ----------------- | --------------------- | --------------------------------------- |
| `workspace.yjs`   | Full Y.Doc            | CRDT sync, source of truth              |
| `definition.json` | `Y.Map('definition')` | Git tracking, human-editable schema     |
| `kv.json`         | `Y.Map('kv')`         | User-editable settings, debugging       |
| `tables.sqlite`   | `Y.Map('tables')`     | SQL queries via Drizzle, large datasets |

### Observer Pattern

```typescript
const definition = ydoc.getMap('definition');
const kv = ydoc.getMap('kv');
const tables = ydoc.getMap('tables');

// Full Y.Doc binary (always, for sync)
ydoc.on('update', (update) => {
	appendUpdate('workspace.yjs', update);
});

// Definition → JSON (on change)
definition.observeDeep(() => {
	writeFile('definition.json', JSON.stringify(definition.toJSON(), null, '\t'));
});

// KV → JSON (on change)
kv.observe(() => {
	writeFile('kv.json', JSON.stringify(kv.toJSON(), null, '\t'));
});

// Tables → SQLite (on change, debounced)
tables.observeDeep(() => {
	debounce(() => syncToSqlite(tables), 1000);
});
```
