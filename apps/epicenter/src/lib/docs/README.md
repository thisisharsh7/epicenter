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
        │   ├── definition.json     # Schema (from Y.Map('definition'))
        │   ├── kv.json             # Settings (from Y.Map('kv'))
        │   └── snapshots/          # Revision history (future)
        │       └── {unix-ms}.ysnap
        │
        └── 1/                      # Epoch 1 (after migration)
            ├── workspace.yjs
            ├── definition.json
            ├── kv.json
            └── snapshots/
                └── ...
```

**Note**: The Node.js library version (`packages/epicenter`) also supports `tables.sqlite` for SQL queries. The Tauri app version currently persists to JSON only.

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

## URL Hierarchy

The URL structure mirrors the storage hierarchy, with epochs and snapshots accessible via nested routes:

```
/workspaces/[id]/...                              # Current epoch (from head doc)
/workspaces/[id]/history                          # Time machine UI
/workspaces/[id]/history/epochs                   # List all epochs
/workspaces/[id]/history/epochs/[epoch]           # Browse specific epoch
/workspaces/[id]/history/epochs/[epoch]/snapshots # List snapshots in epoch
/workspaces/[id]/history/epochs/[epoch]/snapshots/[timestamp]  # View snapshot
```

| Route                                                    | Purpose                         | Editable?           |
| -------------------------------------------------------- | ------------------------------- | ------------------- |
| `/workspaces/[id]/...`                                   | Live workspace at current epoch | Yes                 |
| `/workspaces/[id]/history`                               | Time machine UI (slider)        | No (view only)      |
| `/workspaces/[id]/history/epochs/[epoch]`                | Browse old epoch                | No (unless current) |
| `/workspaces/[id]/history/epochs/[epoch]/snapshots/[ts]` | View snapshot                   | No                  |

**Key principle**: Only the current epoch is editable. Historical epochs and snapshots are read-only views.

## Time Travel (Snapshots)

Snapshots enable Google Docs-style revision history within each epoch.

### Viewing vs Restoring

| Operation   | What Happens                                       | Data Impact              |
| ----------- | -------------------------------------------------- | ------------------------ |
| **View**    | Creates temporary Y.Doc from snapshot              | None (read-only preview) |
| **Restore** | Forks to new epoch with snapshot as starting point | Creates new epoch        |

### Why Fork on Restore?

Y.js is a CRDT; you can't truly "go back in time" because `applyUpdate()` merges rather than replaces. To restore a snapshot:

1. Create new epoch (`currentEpoch + 1`)
2. Initialize new Y.Doc with snapshot state
3. Update head doc to point to new epoch
4. Redirect user to new epoch

This preserves full history (old epochs remain accessible) and matches Git semantics.

### Implementation

```typescript
// Viewing (cheap, temporary)
const previewDoc = Y.createDocFromSnapshot(liveDoc, snapshot);
// Render previewDoc in read-only UI
// Discard when user navigates away

// Restoring (forks to new epoch)
async function restoreToSnapshot(snapshotIndex: number) {
	const snapshot = await revisions.getSnapshot(snapshotIndex);
	const snapshotDoc = Y.createDocFromSnapshot(liveDoc, snapshot);

	// Create new epoch
	const newEpoch = currentEpoch + 1;
	const newDoc = new Y.Doc({ gc: false });
	Y.applyUpdate(newDoc, Y.encodeStateAsUpdate(snapshotDoc));

	// Persist and update head
	await persistNewEpoch(newDoc, newEpoch);
	head.setEpoch(newEpoch);

	// Redirect to new epoch
	goto(`/workspaces/${id}`);
}
```

### Epoch Cleanup

Old epochs can be garbage collected after a retention period:

```typescript
// In settings or admin UI
async function cleanupOldEpochs(keepLast: number = 3) {
	const epochs = await listEpochs(workspaceId);
	const toDelete = epochs.slice(0, -keepLast);
	for (const epoch of toDelete) {
		await deleteEpochFolder(workspaceId, epoch);
	}
}
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

There are two persistence providers, each suited for different Y.Doc types:

### `tauriPersistence` (for Registry & Head docs)

Simple Y.Doc persistence that creates both binary and JSON outputs:

```typescript
// registry.ts and head.ts use tauriPersistence
persistence: (ctx) => tauriPersistence(ctx.ydoc, ['registry']);
// Creates: registry.yjs (binary) + registry.json (mirror)
```

| Output        | Behavior                 | Purpose                   |
| ------------- | ------------------------ | ------------------------- |
| `{name}.yjs`  | Immediate save on update | Source of truth, for sync |
| `{name}.json` | Debounced (500ms)        | Human-readable debug view |

The JSON file is a **one-way mirror**: changes to the JSON are NOT loaded back. It exists purely for debugging and inspection.

### `tauriWorkspacePersistence` (for Workspace docs)

Specialized persistence for workspace Y.Docs that extracts structured data:

```typescript
// workspace.ts uses tauriWorkspacePersistence
persistence: (ctx) =>
	tauriWorkspacePersistence(ctx.ydoc, {
		workspaceId: definition.id,
		epoch,
	});
```

| Output            | Source                | Purpose                             |
| ----------------- | --------------------- | ----------------------------------- |
| `workspace.yjs`   | Full Y.Doc            | CRDT sync, source of truth          |
| `definition.json` | `Y.Map('definition')` | Git tracking, human-editable schema |
| `kv.json`         | `Y.Map('kv')`         | User-editable settings, debugging   |

Internally:

1. Saves `workspace.yjs` on every Y.Doc update (immediate)
2. Debounces `definition.json` writes when `Y.Map('definition')` changes
3. Debounces `kv.json` writes when `Y.Map('kv')` changes

### Why Two Providers?

| Provider                    | Use Case                     | Outputs                                |
| --------------------------- | ---------------------------- | -------------------------------------- |
| `tauriPersistence`          | Simple docs (registry, head) | `{name}.yjs` + `{name}.json`           |
| `tauriWorkspacePersistence` | Workspace docs with schema   | `.yjs` + `definition.json` + `kv.json` |

The workspace provider extracts **specific Y.Maps** into separate JSON files (definition, kv), while the simple provider mirrors the **entire Y.Doc** as JSON.
