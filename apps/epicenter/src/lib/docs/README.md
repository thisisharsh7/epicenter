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
│   │  "Which      │      │  "What       │      │  "The actual data"   │     │
│   │   workspaces │      │   epoch?"    │      │                      │     │
│   │   exist?"    │      │              │      │                      │     │
│   └──────────────┘      └──────────────┘      └──────────────────────┘     │
│         │                     │                        │                   │
│         ▼                     ▼                        ▼                   │
│   registry.yjs          head.yjs              {epoch}.yjs                  │
│                                                                             │
│   ┌──────────────────────────────────────────────────────────────────┐     │
│   │   DEFINITION (static JSON, not Y.Doc)                            │     │
│   │                                                                  │     │
│   │   "What is the workspace schema?"                                │     │
│   │                                                                  │     │
│   │   → definition.json                                              │     │
│   └──────────────────────────────────────────────────────────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Storage Layout

```
{appLocalDataDir}/
├── registry.yjs                    # Index of all workspace IDs
├── registry.json                   # Human-readable snapshot
└── workspaces/
    ├── epicenter.whispering/       # Whispering workspace
    │   ├── definition.json
    │   ├── head.yjs
    │   ├── 0.yjs
    │   └── 0.json
    │
    └── epicenter.crm/              # Example: CRM workspace
        │
        │   # Static definition (edited by UI or text editor)
        ├── definition.json         # WorkspaceDefinition (name, tables, kv)
        │
        │   # Epoch management
        ├── head.yjs                # Current epoch number
        ├── head.json               # Snapshot
        │
        │   # Data storage (Y.Doc per epoch, DATA ONLY)
        ├── 0.yjs                   # Epoch 0 data (rows + kv values)
        ├── 0.json                  # Snapshot
        ├── 1.yjs                   # Epoch 1 (after migration)
        └── 1.json                  # Snapshot
```

### Workspace ID Format

The `id` is a **locally-scoped identifier**, not a GUID:

- **Local/Relay**: `epicenter.whispering`, `epicenter.crm`
- **Y-Sweet (with auth)**: Server combines user ID with local ID for global uniqueness

## Document Types

| Doc Type       | Purpose                            | Storage Path                                    | Helper                                     |
| -------------- | ---------------------------------- | ----------------------------------------------- | ------------------------------------------ |
| **Registry**   | Tracks which workspace GUIDs exist | `{appLocalDataDir}/registry.yjs`                | `registry` (module singleton)              |
| **Head Doc**   | Stores current epoch per workspace | `{appLocalDataDir}/workspaces/{id}/head.yjs`    | `createHead(workspaceId)`                  |
| **Definition** | Static workspace schema/metadata   | `{appLocalDataDir}/workspaces/{id}/definition.json` | JSON read/write                        |
| **Workspace**  | Data for a workspace (rows, kv)    | `{appLocalDataDir}/workspaces/{id}/{epoch}.yjs` | `createWorkspaceClient(definition, epoch)` |

## Key Design Decision: Static Definitions

The workspace definition (name, icon, table schemas) is stored as a **static JSON file**, not in the Y.Doc.

**Why?**
- Definition rarely changes (set once, maybe edited occasionally)
- No need for CRDT overhead on metadata
- File is human-readable and git-friendly
- Simpler mental model: Y.Doc = data, JSON = schema

**What goes where?**

| File | Contents |
|------|----------|
| `definition.json` | `WorkspaceDefinition` (id, name, tables with metadata, kv schema) |
| `{epoch}.yjs` | Table rows (`Y.Map<rowId, Y.Map<field, value>>`) and kv values |

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
client.tables.myTable.insert({ ... });
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

## Definition File Format

The `definition.json` file contains a `WorkspaceDefinition`:

```json
{
  "id": "epicenter.whispering",
  "name": "Whispering",
  "tables": {
    "recordings": {
      "name": "Recordings",
      "icon": { "type": "emoji", "value": "🎙️" },
      "description": "Voice recordings and transcriptions",
      "fields": {
        "id": { "type": "id" },
        "title": { "type": "text" },
        "transcript": { "type": "text", "nullable": true }
      }
    }
  },
  "kv": {}
}
```

When creating a workspace via the SDK with minimal input, the definition is normalized with defaults:

- `name` defaults to humanized `id` (e.g., "content-hub" → "Content hub")
- Table `name` defaults to humanized key (e.g., "blogPosts" → "Blog posts")
- Table `icon` defaults to `{ "type": "emoji", "value": "📄" }`
- Table `description` defaults to `""`
