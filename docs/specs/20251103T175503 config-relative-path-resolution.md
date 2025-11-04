# Simplify Path Configuration with IndexContext

## Problem

Current API is verbose and requires users to configure paths everywhere:

```typescript
// Current: verbose path configuration
indexes: {
  sqlite: (db) => sqliteIndex(db, {
    path: path.join(import.meta.dirname, '.epicenter/database.db')
  }),
  markdown: (db) => markdownIndex(db, {
    rootPath: path.join(import.meta.dirname, './content'),
    // ...
  }),
}

providers: [
  setupPersistence({
    storagePath: path.join(import.meta.dirname, '.epicenter')
  })
]
```

## Solution

1. **Standardize on `.epicenter` directory** - all persistence and SQLite data goes here by default
2. **Introduce `IndexContext`** - similar to `ProviderContext`, provides workspace metadata to indexes
3. **Remove path configuration** - SQLite and persistence auto-resolve paths using workspace ID
4. **Simplify Markdown** - only `rootPath` is configurable, relative to config file by default

## Desired API

```typescript
// New: clean, minimal configuration
indexes: {
  sqlite: sqliteIndex,  // Auto-saves to .epicenter/{workspaceId}.db
  markdown: ({ id, db }) => markdownIndex({
    id,
    db,
    rootPath: './content',  // Relative to epicenter.config.ts
    // ...
  }),
}

providers: [
  setupPersistence()  // Auto-saves to .epicenter/{workspaceId}.yjs
]
```

## Implementation Plan

### 1. Update `ProviderContext`

Add `id` field so providers know the workspace ID without accessing `ydoc.guid`:

```typescript
// packages/epicenter/src/core/workspace/config.ts
export type ProviderContext = {
  id: string;  // NEW: workspace ID
  ydoc: Y.Doc;
};
```

### 2. Create `IndexContext`

Similar to `ProviderContext`, provides workspace metadata to indexes:

```typescript
// packages/epicenter/src/core/indexes/index.ts
export type IndexContext<TSchema extends WorkspaceSchema> = {
  id: string;  // Workspace ID
  db: Db<TSchema>;  // Epicenter database instance
};
```

### 3. Update Workspace Config

Change index functions to receive `IndexContext`:

```typescript
// Before
indexes: {
  [K in keyof TIndexResults]: (
    db: Db<TWorkspaceSchema>,
  ) => TIndexResults[K] | Promise<TIndexResults[K]>;
};

// After
indexes: {
  [K in keyof TIndexResults]: (
    context: IndexContext<TWorkspaceSchema>,
  ) => TIndexResults[K] | Promise<TIndexResults[K]>;
};
```

### 4. Update Workspace Client Initialization

Pass `IndexContext` when calling index functions using Object.fromEntries:

```typescript
// In initializeWorkspaces()
const indexResults = Object.fromEntries(
  await Promise.all(
    Object.entries(config.indexes).map(async ([indexName, indexFn]) => [
      indexName,
      await indexFn({
        id: config.id,  // NEW: pass workspace ID
        db
      })
    ])
  )
);
```

### 5. Refactor `sqliteIndex`

Remove path configuration, auto-resolve to `.epicenter/{id}.db`:

```typescript
// Before
export async function sqliteIndex<TSchema extends WorkspaceSchema>(
  db: Db<TSchema>,
  config: SQLiteIndexConfig = {},
)

// After
export async function sqliteIndex<TSchema extends WorkspaceSchema>(
  { id, db }: IndexContext<TSchema>,
) {
  // Auto-resolve path to .epicenter/{id}.db
  const resolvedDatabasePath = path.join('.epicenter', `${id}.db`);

  // Create parent directory if it doesn't exist
  await mkdir('.epicenter', { recursive: true });

  // Rest of implementation...
}
```

### 6. Refactor `markdownIndex`

Use `IndexContext` and document `rootPath` as config-relative:

```typescript
// Before
export function markdownIndex<TSchema extends WorkspaceSchema>(
  db: Db<TSchema>,
  config: MarkdownIndexConfig<TSchema>,
)

// After
export function markdownIndex<TSchema extends WorkspaceSchema>({
  id,
  db,
  rootPath,
  pathToTableAndId,
  tableAndIdToPath,
  serializers = {},
}: IndexContext<TSchema> & MarkdownIndexConfig<TSchema>) {
  // rootPath is relative to epicenter.config.ts by default
  // Users can also use path.join(import.meta.dirname, ...) for explicit control
  // Or provide absolute paths

  // Rest of implementation...
}
```

Update JSDoc:

```typescript
/**
 * Absolute or relative root path where markdown files should be stored.
 *
 * **Relative paths** (recommended): Resolved relative to epicenter.config.ts location
 * ```typescript
 * rootPath: './content'  // → <config-dir>/content
 * rootPath: '../vault'   // → <config-dir>/../vault
 * ```
 *
 * **Absolute paths**: Used as-is
 * ```typescript
 * rootPath: '/absolute/path/to/vault'
 * ```
 *
 * **Explicit control**: Use import.meta.dirname if needed
 * ```typescript
 * rootPath: path.join(import.meta.dirname, './vault')
 * ```
 */
rootPath: string;
```

### 7. Refactor `setupPersistence`

Remove `storagePath` parameter, auto-resolve to `.epicenter/{id}.yjs`:

```typescript
// Before
export function setupPersistence(options: SetupPersistenceOptions) {
  return async ({ ydoc }: ProviderContext): Promise<void> => {
    const { storagePath } = options;
    const filePath = path.join(storagePath, `${ydoc.guid}.yjs`);
    // ...
  };
}

// After
export function setupPersistence() {
  return async ({ id, ydoc }: ProviderContext): Promise<void> => {
    // Auto-resolve to .epicenter/{id}.yjs
    const storagePath = '.epicenter';
    const filePath = path.join(storagePath, `${id}.yjs`);

    // Ensure storage directory exists
    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }

    // Rest of implementation...
  };
}
```

## Migration Guide

### Before (Verbose)

```typescript
import path from 'node:path';

const workspace = defineWorkspace({
  id: 'blog',

  indexes: {
    sqlite: (db) => sqliteIndex(db, {
      path: path.join(import.meta.dirname, '.epicenter/blog.db')
    }),
    markdown: (db) => markdownIndex(db, {
      rootPath: path.join(import.meta.dirname, './content'),
      // ...
    }),
  },

  providers: [
    setupPersistence({
      storagePath: path.join(import.meta.dirname, '.epicenter')
    })
  ],
});
```

### After (Clean)

```typescript
const workspace = defineWorkspace({
  id: 'blog',

  indexes: {
    sqlite: sqliteIndex,  // ← Just the function!
    markdown: ({ id, db }) => markdownIndex({
      id,
      db,
      rootPath: './content',  // ← Relative to config file
      // ...
    }),
  },

  providers: [
    setupPersistence()  // ← No config needed!
  ],
});
```

## Todo List

- [ ] Update `ProviderContext` type to include `id` field
- [ ] Create `IndexContext` type
- [ ] Update workspace config types to use `IndexContext`
- [ ] Update `initializeWorkspaces` to pass `IndexContext` to index functions
- [ ] Update `initializeWorkspaces` to pass `id` to `ProviderContext`
- [ ] Refactor `sqliteIndex` to use `IndexContext` and remove path config
- [ ] Refactor `markdownIndex` to use `IndexContext`
- [ ] Update `markdownIndex` JSDoc to clarify rootPath resolution
- [ ] Refactor `setupPersistence` to remove `storagePath` parameter
- [ ] Update all examples (basic-workspace, content-hub workspaces)
- [ ] Update main README with new simplified API
- [ ] Update index-specific documentation
