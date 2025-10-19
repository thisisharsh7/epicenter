# YJS Persistence Guide: A Beginner-Friendly Introduction

This guide explains how persistence works in Epicenter, comparing two different patterns and showing you how to make your app work across desktop and web platforms.

## What is YJS?

YJS is a **CRDT (Conflict-free Replicated Data Type)** library. Think of it as a special data structure that:

1. **Tracks every change** to your data (who changed what, when)
2. **Syncs automatically** across multiple users or devices
3. **Resolves conflicts** without losing data (like Google Docs)

In Epicenter, YJS serves as the **source of truth** for all your data. When you insert a row into a table, you're actually updating a YJS document. Epicenter's table helpers are a friendly API wrapper around YJS's lower-level operations.

### The YDoc: Your Database Container

Every workspace has a `Y.Doc` instance. This document:
- Contains all your tables as nested YJS Maps
- Can be serialized to binary format (for saving to disk)
- Can sync with other documents (for collaboration)
- Emits events when data changes (so indexes can update)

```typescript
// Under the hood, this is what happens:
const ydoc = new Y.Doc({ guid: 'my-workspace-id' });

// Your table operations update the YDoc:
db.tables.posts.insert({ id: '1', title: 'Hello' });
// ↓
// YDoc updated → Indexes notified → Files saved
```

## Two Persistence Patterns

Epicenter supports two patterns for persisting your YJS document. Both accomplish the same goal but offer different trade-offs.

### Pattern A: `setupYDoc` Callback (Recommended)

**How it works**: You provide a callback function in your workspace configuration. Epicenter calls this function with the YDoc instance, and you set up persistence however you want.

**Pros**:
- Cross-platform (works on desktop and web)
- Follows YJS conventions
- Maximum flexibility
- Can combine multiple providers (persistence + sync)

**Cons**:
- Slightly more boilerplate
- You manage the persistence logic

**Example**: Desktop with filesystem

```typescript
import * as Y from 'yjs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { defineWorkspace } from '@repo/epicenter';

const blogWorkspace = defineWorkspace({
  id: 'blog',
  version: 1,
  name: 'blog',

  schema: {
    posts: {
      title: text(),
      content: ytext({ nullable: true }),
    }
  },

  // This callback is called BEFORE createEpicenterDb
  // so the YDoc is loaded with saved data before tables initialize
  setupYDoc: (ydoc) => {
    const storagePath = './.epicenter';
    const filePath = path.join(storagePath, 'blog.yjs');

    // Ensure directory exists
    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }

    // Try to load existing state
    try {
      const savedState = fs.readFileSync(filePath);
      Y.applyUpdate(ydoc, savedState);
      console.log(`[Persistence] Loaded from ${filePath}`);
    } catch {
      console.log(`[Persistence] Creating new workspace`);
    }

    // Auto-save on every update
    ydoc.on('update', () => {
      const state = Y.encodeStateAsUpdate(ydoc);
      fs.writeFileSync(filePath, state);
    });
  },

  indexes: ({ db }) => ({
    sqlite: sqliteIndex(db, { databaseUrl: 'file:test-data/blog.db' }),
  }),

  actions: ({ db, indexes }) => ({
    // ... your actions
  }),
});
```

**Example**: Web with IndexedDB

```typescript
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { defineWorkspace } from '@repo/epicenter';

const blogWorkspace = defineWorkspace({
  id: 'blog',
  version: 1,
  name: 'blog',

  schema: {
    posts: {
      title: text(),
      content: ytext({ nullable: true }),
    }
  },

  // Same pattern, different storage mechanism
  setupYDoc: (ydoc) => {
    // y-indexeddb handles loading and saving automatically
    // It stores the YDoc in browser's IndexedDB under the key 'blog'
    new IndexeddbPersistence('blog', ydoc);

    console.log('[Persistence] IndexedDB persistence enabled');
  },

  indexes: ({ db }) => ({
    sqlite: sqliteIndex(db, { databaseUrl: 'file:test-data/blog.db' }),
  }),

  actions: ({ db, indexes }) => ({
    // ... your actions
  }),
});
```

### Pattern B: `createEpicenterDbFromDisk` Wrapper (Desktop Only)

**How it works**: Instead of using `createEpicenterDb` directly, you use a wrapper function that handles persistence for you.

**Pros**:
- Simpler API with built-in methods (`.save()`, `.enableAutoSave()`)
- Less boilerplate for desktop apps
- Good for beginners

**Cons**:
- Desktop/Node.js only (no web support)
- Less flexible (filesystem only)
- More opinionated

**Example**: Desktop with filesystem

```typescript
import { createEpicenterDbFromDisk } from '@repo/epicenter/db/desktop';

// Instead of createEpicenterDb, use the wrapper
const db = createEpicenterDbFromDisk('blog', {
  posts: {
    title: text(),
    content: ytext({ nullable: true }),
  }
}, {
  storagePath: './.epicenter',
  autosave: true,  // Auto-save on every update
});

// Now you have additional methods:
db.save();             // Manually save to disk
db.disableAutoSave();  // Turn off auto-save
// ... do batch operations ...
db.save();             // Save once when done
db.enableAutoSave();   // Turn auto-save back on

// All the normal db methods still work:
db.tables.posts.insert({ id: '1', title: 'Hello' });
```

**How it's implemented** (from `packages/epicenter/src/db/desktop.ts`):

```typescript
export function createEpicenterDbFromDisk(
  workspaceId: string,
  schema: WorkspaceSchema,
  options?: { storagePath?: string; autosave?: boolean }
) {
  const { storagePath = './data/workspaces', autosave = true } = options ?? {};
  const filePath = path.join(storagePath, `${workspaceId}.yjs`);

  // Create and load YDoc
  const ydoc = new Y.Doc({ guid: workspaceId });

  // Load from disk
  try {
    const savedState = fs.readFileSync(filePath);
    Y.applyUpdate(ydoc, savedState);
  } catch {
    console.log(`Creating new workspace ${workspaceId}`);
  }

  // Create database
  const db = createEpicenterDb(ydoc, schema);

  // Save function
  function save() {
    const state = Y.encodeStateAsUpdate(ydoc);
    fs.writeFileSync(filePath, state);
  }

  // Setup autosave if enabled
  if (autosave) {
    ydoc.on('update', save);
  }

  // Return enhanced db with save methods
  return {
    ...db,
    save,
    enableAutoSave() { ydoc.on('update', save); },
    disableAutoSave() { ydoc.off('update', save); },
  };
}
```

## Making It Cross-Platform: Isomorphic Code

The key insight is that both patterns do the same two things:

1. **Load existing state**: `Y.applyUpdate(ydoc, savedState)`
2. **Save on updates**: `ydoc.on('update', saveFunction)`

The only difference is WHERE you save (filesystem vs IndexedDB). You can abstract this!

### Approach 1: Platform-Specific Imports

```typescript
// persistence.desktop.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as Y from 'yjs';

export function setupPersistence(ydoc: Y.Doc, workspaceId: string) {
  const filePath = path.join('./.epicenter', `${workspaceId}.yjs`);

  // Load
  try {
    const savedState = fs.readFileSync(filePath);
    Y.applyUpdate(ydoc, savedState);
  } catch {}

  // Save
  ydoc.on('update', () => {
    const state = Y.encodeStateAsUpdate(ydoc);
    fs.writeFileSync(filePath, state);
  });
}
```

```typescript
// persistence.web.ts
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';

export function setupPersistence(ydoc: Y.Doc, workspaceId: string) {
  // y-indexeddb handles both loading and saving
  new IndexeddbPersistence(workspaceId, ydoc);
}
```

```typescript
// epicenter.config.ts
// Import the right one based on your platform
import { setupPersistence } from './persistence.desktop';
// or
import { setupPersistence } from './persistence.web';

const workspace = defineWorkspace({
  id: 'blog',
  setupYDoc: (ydoc) => setupPersistence(ydoc, 'blog'),
  // ... rest of config
});
```

### Approach 2: Runtime Detection

```typescript
// persistence.ts
import * as Y from 'yjs';

export function setupPersistence(ydoc: Y.Doc, workspaceId: string) {
  // Detect environment
  const isNode = typeof process !== 'undefined' && process.versions?.node;

  if (isNode) {
    // Desktop: filesystem
    const fs = require('node:fs');
    const path = require('node:path');
    const filePath = path.join('./.epicenter', `${workspaceId}.yjs`);

    try {
      const savedState = fs.readFileSync(filePath);
      Y.applyUpdate(ydoc, savedState);
    } catch {}

    ydoc.on('update', () => {
      const state = Y.encodeStateAsUpdate(ydoc);
      fs.writeFileSync(filePath, state);
    });
  } else {
    // Web: IndexedDB
    const { IndexeddbPersistence } = require('y-indexeddb');
    new IndexeddbPersistence(workspaceId, ydoc);
  }
}
```

### Approach 3: Dependency Injection

```typescript
// persistence.interface.ts
import type * as Y from 'yjs';

export type PersistenceProvider = {
  load: () => Promise<Uint8Array | null>;
  save: (state: Uint8Array) => Promise<void>;
};

export function setupPersistence(
  ydoc: Y.Doc,
  provider: PersistenceProvider
) {
  // Load on startup
  provider.load().then((savedState) => {
    if (savedState) {
      Y.applyUpdate(ydoc, savedState);
    }
  });

  // Save on updates
  ydoc.on('update', async () => {
    const state = Y.encodeStateAsUpdate(ydoc);
    await provider.save(state);
  });
}
```

```typescript
// persistence.desktop.ts
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export function createFilesystemProvider(workspaceId: string) {
  const filePath = path.join('./.epicenter', `${workspaceId}.yjs`);

  return {
    async load() {
      try {
        return await fs.readFile(filePath);
      } catch {
        return null;
      }
    },
    async save(state: Uint8Array) {
      await fs.writeFile(filePath, state);
    },
  };
}
```

```typescript
// persistence.web.ts
export function createIndexedDBProvider(workspaceId: string) {
  return {
    async load() {
      // IndexedDB load logic
      const db = await openDB(workspaceId);
      return await db.get('state');
    },
    async save(state: Uint8Array) {
      // IndexedDB save logic
      const db = await openDB(workspaceId);
      await db.put('state', state);
    },
  };
}
```

```typescript
// epicenter.config.ts
import { setupPersistence } from './persistence.interface';
import { createFilesystemProvider } from './persistence.desktop';
// or
import { createIndexedDBProvider } from './persistence.web';

const workspace = defineWorkspace({
  id: 'blog',
  setupYDoc: (ydoc) => {
    const provider = createFilesystemProvider('blog');
    // or
    // const provider = createIndexedDBProvider('blog');

    setupPersistence(ydoc, provider);
  },
  // ... rest of config
});
```

## Comparing the Patterns: Side by Side

### Desktop: Filesystem

#### setupYDoc Pattern
```typescript
setupYDoc: (ydoc) => {
  const filePath = './.epicenter/blog.yjs';

  // Load
  try {
    const saved = fs.readFileSync(filePath);
    Y.applyUpdate(ydoc, saved);
  } catch {}

  // Save
  ydoc.on('update', () => {
    fs.writeFileSync(filePath, Y.encodeStateAsUpdate(ydoc));
  });
}
```

#### createEpicenterDbFromDisk Pattern
```typescript
const db = createEpicenterDbFromDisk('blog', schema, {
  storagePath: './.epicenter',
  autosave: true
});

// Extra methods available:
db.save();
db.enableAutoSave();
db.disableAutoSave();
```

### Web: IndexedDB

#### setupYDoc Pattern
```typescript
setupYDoc: (ydoc) => {
  // y-indexeddb handles both load and save
  new IndexeddbPersistence('blog', ydoc);
}
```

#### createEpicenterDbFromDisk Pattern
**Not available** - This pattern only works on desktop with filesystem.

## When to Use Which Pattern

### Use `setupYDoc` callback when:
- ✅ Building a cross-platform app (desktop + web)
- ✅ You want maximum flexibility
- ✅ You need to combine providers (e.g., persistence + WebRTC sync)
- ✅ You're comfortable with YJS concepts
- ✅ You want to follow YJS conventions

### Use `createEpicenterDbFromDisk` when:
- ✅ Building a desktop-only app (Tauri, Electron)
- ✅ You want a simpler API with fewer concepts
- ✅ You need manual save control (`.save()`, `.disableAutoSave()`)
- ✅ You prefer opinionated defaults
- ❌ **NOT** when building for web

## Common Patterns and Tips

### 1. Multiple Workspaces, Shared Storage

Each workspace should have its own file, named by workspace ID:

```typescript
// Workspace A
const workspaceA = defineWorkspace({
  id: 'workspace-a',  // → .epicenter/workspace-a.yjs
  setupYDoc: (ydoc) => setupPersistence(ydoc, 'workspace-a'),
});

// Workspace B
const workspaceB = defineWorkspace({
  id: 'workspace-b',  // → .epicenter/workspace-b.yjs
  setupYDoc: (ydoc) => setupPersistence(ydoc, 'workspace-b'),
});
```

Both workspaces share `.epicenter/` but have isolated state.

### 2. Combining Persistence with Sync

You can use multiple providers on the same YDoc:

```typescript
setupYDoc: (ydoc) => {
  // Persistence (saves to disk)
  new IndexeddbPersistence('blog', ydoc);

  // Sync (shares with other users)
  new WebrtcProvider('blog-room', ydoc);

  // Both work together!
  // Changes sync to other users AND save locally
}
```

### 3. Manual vs Auto-Save

**Auto-save** (recommended for most apps):
```typescript
ydoc.on('update', () => {
  fs.writeFileSync(filePath, Y.encodeStateAsUpdate(ydoc));
});
```

**Manual save** (useful for batch operations):
```typescript
let autoSaveCleanup: (() => void) | null = null;

function enableAutoSave() {
  const handler = () => fs.writeFileSync(filePath, Y.encodeStateAsUpdate(ydoc));
  ydoc.on('update', handler);
  autoSaveCleanup = () => ydoc.off('update', handler);
}

function disableAutoSave() {
  autoSaveCleanup?.();
  autoSaveCleanup = null;
}

// Use it:
disableAutoSave();
// ... do 1000 inserts ...
save();  // Save once at the end
enableAutoSave();
```

### 4. Error Handling

Always handle errors when loading state:

```typescript
setupYDoc: (ydoc) => {
  try {
    const saved = fs.readFileSync(filePath);
    Y.applyUpdate(ydoc, saved);
    console.log('[Persistence] Loaded existing workspace');
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('[Persistence] No existing workspace, starting fresh');
    } else {
      console.error('[Persistence] Error loading workspace:', error);
      // Decide: start fresh or throw error
    }
  }
}
```

### 5. Testing with Persistence

For tests, you might want to disable persistence or use in-memory storage:

```typescript
const isTest = process.env.NODE_ENV === 'test';

const workspace = defineWorkspace({
  id: 'blog',
  setupYDoc: isTest ? undefined : (ydoc) => {
    // Only set up persistence in non-test environments
    setupPersistence(ydoc, 'blog');
  },
});
```

## Key Takeaways

1. **YJS is your source of truth** - All data lives in a YJS document
2. **Persistence is simple** - Load with `Y.applyUpdate()`, save on `'update'` event
3. **Two patterns available**:
   - `setupYDoc` callback: Flexible, cross-platform, recommended
   - `createEpicenterDbFromDisk`: Simple, desktop-only, opinionated
4. **Cross-platform is easy** - Just swap the storage mechanism (filesystem vs IndexedDB)
5. **Critical order**: Load state BEFORE creating tables (`setupYDoc` runs first)

## Further Reading

- [YJS Documentation](https://docs.yjs.dev/)
- [y-indexeddb Provider](https://github.com/yjs/y-indexeddb)
- [Epicenter Handoff: YJS Persistence Rollout](../docs/handoff-yjs-persistence-rollout.md)
- [Epicenter Examples](../packages/epicenter/examples/)
