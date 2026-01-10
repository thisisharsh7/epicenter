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
│   │  "Which      │      │  "What       │      │  "The actual         │     │
│   │   workspaces │      │   epoch?"    │   │   definition & data" │     │
│   │   exist?"    │      │              │      │                      │     │
│   └──────────────┘      └──────────────┘      └──────────────────────┘     │
│         │                     │                        │                    │
│         ▼                     ▼                        ▼                    │
│   registry.yjs          head.yjs              {epoch}.yjs                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Document Types

| Doc Type      | Purpose                             | Storage Path                                    | Helper                                     |
| ------------- | ----------------------------------- | ----------------------------------------------- | ------------------------------------------ |
| **Registry**  | Tracks which workspace GUIDs exist  | `{appLocalDataDir}/registry.yjs`                | `registry` (module singleton)              |
| **Head Doc**  | Stores current epoch per workspace  | `{appLocalDataDir}/workspaces/{id}/head.yjs`    | `createHead(workspaceId)`                  |
| **Workspace** | Definition and data for a workspace | `{appLocalDataDir}/workspaces/{id}/{epoch}.yjs` | `createWorkspaceClient(definition, epoch)` |

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
