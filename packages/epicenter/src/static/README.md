# Static Workspace API

Type-safe schema definitions and workspace clients for versioned local-first data.

## Mental Model

The Static Workspace API is a **typed interface over Y.js** for apps that evolve their data schema over time.

```
┌────────────────────────────────────────────────┐
│  Your App                                      │
├────────────────────────────────────────────────┤
│  defineWorkspace() → workspace.create()        │ ← High-level (easy)
│  ↓ Result: WorkspaceClient                     │
│  { tables, kv, capabilities, ydoc }            │
├────────────────────────────────────────────────┤
│  createTables(ydoc, {...})                     │ ← Mid-level
│  createKv(ydoc, {...})                         │   (control)
├────────────────────────────────────────────────┤
│  Y.Doc (raw CRDT)                              │ ← Low-level
│  ↓ Storage: table:posts, table:users, kv      │   (escape hatch)
└────────────────────────────────────────────────┘
```

Three design principles:

1. **Layered**: Start simple, drop to lower levels for control
2. **Composable**: Everything works with plain objects and Y.Docs
3. **Type-Safe**: Schema versions are enforced at compile time, migrations validated at runtime

## What Problem Does This Solve?

Local-first apps can't run migration scripts. Data lives on user devices. So you need:

- **Schema versioning** - Old rows coexist with new indefinitely
- **Automatic migration** - Data transforms on read, not on write (no startup penalties)
- **Error handling** - Invalid data is caught and surfaced, not silently dropped
- **Type safety** - Migrations are typed; TypeScript catches missing cases

## Key Files

| File | Purpose |
| --- | --- |
| `define-table.ts` | `defineTable()` builder - pure schema definition |
| `define-kv.ts` | `defineKv()` builder - pure schema definition |
| `define-workspace.ts` | `defineWorkspace()` and `workspace.create()` - high-level API |
| `create-tables.ts` | `createTables()` - bind schemas to Y.Doc |
| `create-kv.ts` | `createKv()` and KvHelper - bind KV to Y.Doc |
| `table-helper.ts` | TableHelper - CRUD, batch, observe |
| `types.ts` | All shared type definitions |
| `schema-union.ts` | Union validation across schema versions |

## Core Pattern: define vs create

**`define*`** - Pure schema definitions, no Y.Doc, no side effects

```typescript
const posts = defineTable()
	.version(type({ id: 'string', title: 'string' }))
	.migrate((row) => row);

const workspace = defineWorkspace({ id: 'my-app', tables: { posts } });
```

**`create*`** - Instantiation with a Y.Doc (creates one if you don't provide it)

```typescript
const client = workspace.create();  // Creates Y.Doc + tables + KV

// Or bring your own
const tables = createTables(myYdoc, { posts });
```

## When to Use Each Layer

### Layer 1: `defineWorkspace().create()`

For most apps. It's synchronous, returns immediately, and gives you a typed client.

```typescript
const client = workspace.create({ capabilities });
client.tables.posts.set({ id: '1', title: 'Hello' });
```

### Layer 2: Capabilities

When you need extensibility (persistence, sync, databases) without building it into the core.

```typescript
const client = workspace.create({
	persistence: ({ ydoc }) => {
		// You have access to ydoc, tables, kv
		// Must return Lifecycle (whenSynced, destroy)
	},
});
```

### Layer 3: `createTables / createKv`

When you have a shared Y.Doc (collaboration, multiple workspaces) or custom lifecycle management.

```typescript
const ydoc = collaborationProvider.ydoc;
const tables = createTables(ydoc, { posts });
```

## Design Decisions Embedded in Code

1. **Row-level atomicity**: `set()` replaces entire rows, not field-level updates. Enables schema versioning without consistency headaches.

2. **Migration on read**: Old data transforms when loaded, not when written. Old rows stay old until explicitly rewritten. Enables rollback.

3. **No write validation**: Validation is TypeScript's job. Invalid reads are caught and surfaced.

4. **No field-level observation**: Observe whole tables or KV keys. Let your UI framework handle field reactivity.

See `docs/articles/20260127T120000-static-workspace-api-guide.md` for detailed rationale.

## Testing

- `*.test.ts` files test each module in isolation
- Use `new Y.Doc()` for in-memory tests
- Migrations are validated by reading old data and checking the result
- See individual test files for patterns

## Related

- **Specification**: `specs/20260126T120000-static-workspace-api.md`
- **Versioned storage internals**: `specs/20260125T120000-versioned-table-kv-specification.md`
- **Capability lifecycle**: `core/lifecycle.ts` (`defineExports()`)
- **KV implementation**: `core/utils/y-keyvalue.ts`
