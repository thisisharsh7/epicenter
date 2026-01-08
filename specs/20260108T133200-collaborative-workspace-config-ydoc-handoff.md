# Handoff: Collaborative Workspace Config Y.Doc

**Date**: 2026-01-08
**Parent Spec**: `20260108T133200-collaborative-workspace-config-ydoc.md`

## What Was Implemented

### Terminology Refactor (Complete)

The workspace identifier terminology has been standardized:

```typescript
// OLD API
const workspace = defineWorkspace({
  guid: generateGuid(),  // 15-char globally unique
  id: 'blog',            // human-readable slug
  name: 'Blog',
  tables: { ... },
  kv: {},
});

// NEW API
const workspace = defineWorkspace({
  id: generateWorkspaceId(),  // 15-char globally unique
  slug: 'blog',               // human-readable slug
  name: 'Blog',
  tables: { ... },
  kv: {},
});
```

**Deprecation aliases provided:**

- `Guid` type → Use `WorkspaceId`
- `generateGuid()` → Use `generateWorkspaceId()`

**Y.Doc GUID format:**

- Already uses `{id}-0` (workspace ID + hyphen + epoch)
- Hyphen delimiter is y-sweet compatible (colons not allowed)

### Files Changed

```
packages/epicenter/src/core/schema/fields/id.ts    # New types + deprecation aliases
packages/epicenter/src/core/schema/index.ts        # Export new types
packages/epicenter/src/index.ts                    # Export new types
packages/epicenter/src/core/workspace/contract.ts  # Core type changes
packages/epicenter/src/core/capability.ts          # JSDoc clarification
packages/epicenter/src/cli/cli.ts                  # Generic param update
packages/epicenter/src/cli/discovery.ts            # Generic param update
packages/epicenter/src/server/server.ts            # Generic param update
packages/epicenter/src/server/tables.ts            # Generic param update
packages/epicenter/scripts/*.ts                    # Use new API
apps/epicenter/src/**/*.ts                         # Use new API
apps/tab-manager/src/**/*.ts                       # Use new API
examples/basic-workspace/epicenter.config.ts       # Use new API
```

## What Remains to Implement

### 1. Registry Y.Doc (Per User)

**Purpose:** Personal index of workspaces the user has access to.

**Implementation tasks:**

- [ ] Create `RegistryDoc` class to manage user's workspace list
- [ ] Store as `Y.Map('workspaces')` where keys are workspace IDs, values are `true`
- [ ] Sync only across user's own devices (not with other users)
- [ ] Integrate with auth server to get `registryId`

**Data structure:**

```typescript
// Y.Doc ID: {registryId}
Y.Map('workspaces')
  └── {workspaceId}: true
```

### 2. Head Y.Doc (Per Workspace)

**Purpose:** Pointer to current data epoch, shared among collaborators.

**Implementation tasks:**

- [ ] Create `HeadDoc` class with epoch pointer
- [ ] Store as `Y.Map('head')` with `epoch` key
- [ ] Add `isMigrating` flag for epoch bump coordination
- [ ] Sync with all workspace collaborators

**Data structure:**

```typescript
// Y.Doc ID: {workspaceId}
Y.Map('head')
  └── epoch: number (currently always 0)
```

### 3. Separate Data Y.Doc from Head

**Current state:** Single Y.Doc at `{id}-0` contains all data.

**Target state:**

- Head doc at `{workspaceId}` (no epoch suffix)
- Data doc at `{workspaceId}-{epoch}`

**Implementation tasks:**

- [ ] On workspace create, first connect to Head doc
- [ ] Read current epoch from head
- [ ] Then connect to Data doc at `{workspaceId}-{epoch}`
- [ ] Subscribe to head changes for epoch bumps

### 4. Schema Storage in Y.Doc

**Purpose:** Enable collaborative schema editing.

**Implementation tasks:**

- [ ] Add `Y.Map('schema')` to Data Y.Doc structure
- [ ] Nested structure: `schema.tables.{tableName}.{fieldName}` → JSON field definition
- [ ] On `workspace.create()`:
  - If Y.Doc schema empty → seed from code schema
  - If Y.Doc schema exists → use it for runtime validation
- [ ] TypeScript types always from code schema (compile-time)
- [ ] Runtime validation uses Y.Doc schema

**Data structure:**

```typescript
// Y.Doc ID: {workspaceId}-{epoch}
Y.Map('schema')
  ├── tables: Y.Map
  │   └── {tableName}: Y.Map
  │       └── {fieldName}: { type: 'text', nullable: false, ... }
  └── kv: Y.Map
      └── {keyName}: { type: 'text', ... }
```

### 5. Epoch Bump Flow

**Purpose:** Atomic schema migrations and compaction.

**Implementation tasks:**

- [ ] Implement `bumpEpoch()` function:
  1. Set `head.isMigrating = true`
  2. Create new Data Y.Doc at `{workspaceId}-{epoch+1}`
  3. Migrate data from old epoch
  4. Update `head.epoch = epoch + 1`
  5. Clear `head.isMigrating`
- [ ] All clients observe head changes and reconnect on epoch bump
- [ ] Consider epoch coordination (single writer vs distributed)

### 6. Auth Server Integration

**Purpose:** Permission management for workspace access.

**Implementation tasks:**

- [ ] Add `permissions` table to auth server
- [ ] Add `shareLinks` table for invitation tokens
- [ ] Sync server checks permissions before allowing room join
- [ ] Store `bootstrapSyncNodes` in user record

## Migration Considerations

### Existing Data

Workspaces created with old API have:

- `guid` field in stored JSON
- `id` field (slug) in stored JSON

When loading old workspace files:

```typescript
// Migration layer
const workspace = defineWorkspace({
  id: oldData.guid ?? generateWorkspaceId(),  // guid → id
  slug: oldData.id,                            // id → slug
  ...
});
```

### Y.Doc Persistence

Existing `.yjs` files are named using `{guid}-0` format. This is compatible with new `{id}-0` format since the value hasn't changed, just the property name.

## Testing Checklist

- [ ] Create workspace with new API
- [ ] Load workspace with deprecation aliases (backward compat)
- [ ] Verify Y.Doc GUID is `{id}-0` format
- [ ] Verify capabilities receive `slug` as their `id` context
- [ ] Multi-device sync still works (same room names)
- [ ] IndexedDB persistence still works (same DB names)

## Architecture Diagram

```
                                    AUTH SERVER
                                        │
                            ┌───────────┴───────────┐
                            │  registryId           │
                            │  bootstrapSyncNodes   │
                            │  permissions          │
                            └───────────┬───────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
              DEVICE A              DEVICE B            DEVICE C
                    │                   │                   │
        ┌───────────┴───────────┐       │                   │
        │                       │       │                   │
   REGISTRY Y.Doc          REGISTRY Y.Doc              REGISTRY Y.Doc
   {registryId}            {registryId}                {registryId}
   (personal, syncs        (syncs across               (syncs across
    across A's devices)     B's devices)               C's devices)
        │                       │                           │
        └───────────────────────┼───────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │   HEAD Y.Doc          │
                    │   {workspaceId}       │  ← Shared among
                    │   epoch: 0            │     all collaborators
                    └───────────┬───────────┘
                                │
                    ┌───────────┴───────────┐
                    │   DATA Y.Doc          │
                    │   {workspaceId}-0     │  ← Shared among
                    │   schema + data       │     all collaborators
                    └───────────────────────┘
```

## References

- Parent spec: `20260108T133200-collaborative-workspace-config-ydoc.md`
- Local-first discovery: `20260108T062000-local-first-workspace-discovery.md`
- Workspace GUID epochs: `20260107T005800-workspace-guid-and-epochs.md`
