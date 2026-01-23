# Single Workspace Architecture: One Doc Per Workspace

## Summary

An alternative to the multi-doc subdoc architecture. Instead of splitting workspace data across multiple Y.Docs (Head, Tables, KV), use a **single Y.Doc per workspace** with co-located definitions and data.

This document explores the structure, trade-offs, and migration path for this simpler approach.

## Key Insight: Layers Have Different Concerns

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   YJS Document (Source of Truth)         Files (Materialized Views)         │
│   ══════════════════════════════         ═══════════════════════════        │
│                                                                             │
│   Co-located for:                        Separated for:                     │
│   • API ergonomics                       • Human readability                │
│   • Atomic transactions                  • Right tool per data type         │
│   • Single mental model                  • Different change frequencies     │
│   • Granular observation                 • Debugging & inspection           │
│                                                                             │
│   ┌─────────────────────────┐            ┌─────────────────────────┐        │
│   │ Y.Map('tables')         │            │ definition.json         │        │
│   │   └── posts             │     ──►    │   (all schemas)         │        │
│   │       ├── name ─────────┼────────►   │                         │        │
│   │       ├── icon ─────────┼────────►   │                         │        │
│   │       ├── fields ───────┼────────►   │                         │        │
│   │       └── rows ─────────┼────────►   │ tables.sqlite           │        │
│   │                         │            │   (row data only)       │        │
│   │ Y.Map('kv')             │            │                         │        │
│   │   └── theme             │     ──►    │ kv.json                 │        │
│   │       ├── name ─────────┼────────►   │   (values only)         │        │
│   │       ├── field ────────┼────────►   │                         │        │
│   │       └── value ────────┼────────►   └─────────────────────────┘        │
│   └─────────────────────────┘                                               │
│                                                                             │
│   ONE co-located structure               THREE separated files              │
│   (developer ergonomics)                 (operational ergonomics)           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**The API mirrors the YJS structure** (co-located), but **the files are separated by concern**.

---

## Decision: Why Single Doc?

We evaluated two approaches:

### Option A: Multiple Docs (Current Spec)

Separate Y.Docs for each table, plus shared docs for metadata and KV.

### Option B: Single Workspace Doc (This Spec)

All tables and KV in one Y.Doc with co-located definitions.

### Key Factors in the Decision

| Factor                    | Multiple Docs                 | Single Doc                   | Winner |
| ------------------------- | ----------------------------- | ---------------------------- | ------ |
| Implementation simplicity | More plumbing                 | Simpler                      | Single |
| Atomic multi-table ops    | Requires two-phase pattern    | Native `transact()`          | Single |
| Mental model              | Multiple docs to track        | One doc, one mental model    | Single |
| Initial load time         | Load only what's needed       | Must load entire workspace   | Multi  |
| Memory usage              | Only open tables in memory    | All tables always in memory  | Multi  |
| Sync bandwidth            | Only relevant table changes   | All changes to all users     | Multi  |
| Mobile viability          | 0.5-0.8 MB per table = 10-15s | 10-16 MB doc = 2-3 min on 3G | Multi  |
| Corruption blast radius   | Only affected table           | Entire workspace at risk     | Multi  |

### When Single Doc Works Well

- Small to medium workspaces (< 10 tables, < 5000 total rows)
- Desktop-first applications
- Single-user or small team collaboration
- Prototyping and rapid development
- When atomic cross-table operations are common

### When to Consider Multi-Doc

- Large workspaces (> 50k rows)
- Mobile-first applications
- Many concurrent editors (> 5)
- When tables are accessed independently
- When blast radius isolation is critical

---

## Why Co-located in YJS + API

The YJS document structure and API are **co-located**—definitions live alongside data. This is intentional.

### 1. API Ergonomics

**Co-located (what we're doing):**

```typescript
const posts = workspace.tables('posts');

// Everything about "posts" is RIGHT HERE
posts.name; // metadata
posts.icon; // metadata
posts.fields.get('title'); // definition
posts.rows.get({ id: '1' }); // data

// One mental model: "I have a table, it has everything"
```

**Separated (the alternative we rejected):**

```typescript
// Would have to access THREE different trees
const postsMeta = workspace.definitions.tables('posts'); // metadata
const postsFields = workspace.definitions.tables('posts').fields; // definition
const postsRows = workspace.data.tables('posts'); // data

// Mental overhead: "Where does this live again?"
```

### 2. Atomic Operations

**Co-located:** Adding a field with default values is one transaction:

```typescript
workspace.ydoc.transact(() => {
	// Same Y.Map subtree—guaranteed atomic
	posts.fields.set('status', {
		type: 'select',
		options: ['draft', 'published'],
		default: 'draft',
	});

	// Backfill existing rows in the same transaction
	for (const [id, row] of posts.rows.entries()) {
		if (!row.has('status')) {
			row.set('status', 'draft');
		}
	}
});
```

**Separated:** Would require coordinating across different Y.Maps or even different Y.Docs—complex and error-prone.

### 3. Granular Observation

Co-location enables **precise observation** at any level of the tree:

```typescript
// Watch just table metadata (name, icon changes)
postsYMap.observe((event) => {
	// Only fires for direct children: name, icon, description
	// Does NOT fire for field or row changes
	updateSidebarUI();
});

// Watch just fields (schema changes)
postsYMap.get('fields').observe((event) => {
	// Only fires when fields are added/removed/modified
	rebuildTableColumns();
});

// Watch just rows (data changes)
postsYMap.get('rows').observeDeep((events) => {
	// Fires for any row or cell change
	syncToSQLite();
});

// Watch everything about posts
postsYMap.observeDeep((events) => {
	// Fires for ANY change: metadata, fields, or rows
	fullTableRebuild();
});
```

**This is possible BECAUSE of co-location.** If definitions were in a separate tree, you couldn't easily observe "all changes to the posts table" with a single `observeDeep`.

### 4. No Cross-Referencing

**Co-located:**

```typescript
const table = workspace.tables('posts');
const titleField = table.fields.get('title');
const rows = table.rows.getAll();
// Everything is right here
```

**Separated:**

```typescript
const tableDef = workspace.definitions.tables.get('posts');
const titleField = workspace.definitions.fields.get('posts', 'title');
const rows = workspace.data.tables.get('posts');
// Have to know where to look for each piece
```

---

## Why Separated in File System

While YJS is co-located, the **materialized files** are separated by concern. Different reasons:

### 1. Right Tool for the Job

| Data Type             | Best Storage | Why                                         |
| --------------------- | ------------ | ------------------------------------------- |
| Definitions (schemas) | JSON         | Human-readable, versionable, inspectable    |
| Row data              | SQLite       | Queryable, indexed, handles large datasets  |
| KV values             | JSON         | Tiny, loaded all at once, no queries needed |

### 2. Different Change Frequencies

- **Definitions:** Change rarely (add a field once a week)
- **Row data:** Changes constantly (every user action)
- **KV values:** Change occasionally (user changes a setting)

Separating them means you can:

- Version control `definition.json` in git
- Let SQLite handle the heavy lifting for rows
- Keep `kv.json` tiny and fast to load

### 3. Debugging & Inspection

```bash
# "What's the schema?"
cat definition.json | jq .

# "What are the current settings?"
cat kv.json

# "How many posts?"
sqlite3 tables.sqlite "SELECT COUNT(*) FROM posts"
```

If everything was in one binary YJS file, you'd need special tooling.

---

## Document Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  WORKSPACE DOC (guid: "ws-123")                                             │
│  One doc to rule them all                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Y.Map('meta')                         # Workspace identity                 │
│    ├── name: "My Blog"                                                      │
│    ├── icon: "emoji:📝"                # Tagged string (see Icon Storage)   │
│    └── description: "..."                                                   │
│                                                                             │
│  Y.Map('tables')                       # All tables (top-level)             │
│    └── {tableId}: Y.Map                                                     │
│        ├── name: "Posts"                                                    │
│        ├── icon: "emoji:📝"                                                 │
│        ├── description: "..."                                               │
│        ├── createdAt: 1706000000                                            │
│        ├── deletedAt: null             # Tombstone for soft delete          │
│        │                                                                    │
│        ├── fields: Y.Map               # Co-located field definitions       │
│        │   └── {fieldId}: Field                                             │
│        │       ├── type: "text"                                             │
│        │       ├── name: "Title"                                            │
│        │       ├── description: ""                                          │
│        │       ├── icon: null                                               │
│        │       ├── nullable: false                                          │
│        │       └── default: undefined                                       │
│        │                                                                    │
│        └── rows: Y.Map                 # Co-located row data                │
│            └── {rowId}: Y.Map                                               │
│                └── {fieldId}: value                                         │
│                                                                             │
│  Y.Map('kv')                           # KV store (top-level, separate)     │
│    └── {key}: Y.Map                                                         │
│        ├── name: "Theme"                                                    │
│        ├── icon: "emoji:🎨"                                                 │
│        ├── description: "Color theme preference"                            │
│        ├── field: Field                # Co-located field definition        │
│        │   ├── type: "select"                                               │
│        │   ├── options: ["light", "dark"]                                   │
│        │   └── default: "light"                                             │
│        └── value: "dark"               # Co-located value                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Design Decisions

### 1. Tables at Top-Level

Tables are a top-level concept in `Y.Map('tables')`:

```typescript
doc.getMap('tables').get('tbl-123');
```

**Why:**

- Clear namespace separation from KV
- Tables and KV are fundamentally different data shapes
- Easy to enumerate all tables for sidebar UI

### 2. Fields Co-located with Tables

Field definitions live inside each table, not in a separate schemas map:

```typescript
// Co-located approach (direct)
const table = doc.getMap('tables').get(tableId);
const fields = table.get('fields');
const rows = table.get('rows');
```

**Why co-locate:**

- **Locality**: When you need a table, you need its schema. Always.
- **Atomic operations**: Adding a field + setting default values = one `transact()`
- **Simpler mental model**: "A table has fields and rows" is intuitive
- **No cross-referencing**: Don't need to look up `schemas.get(tableId)` separately

### 3. KV Separate from Tables (Top-Level)

KV is structurally different from tables:

- No "rows"—just key → single value
- Often used for settings/config
- Different access patterns

Keeping it at top-level (`doc.getMap('kv')`) makes sense.

### 4. KV Field + Value Co-located

Each KV entry contains both its field definition and its value:

```typescript
const themeEntry = doc.getMap('kv').get('theme');
const field = themeEntry.get('field'); // { type: 'select', options: [...] }
const value = themeEntry.get('value'); // 'dark'
```

**Why:**

- No need to look up schema separately
- Atomic updates when changing both definition and value
- Self-contained entries

### 5. Naming: "Field" Not "Schema"

Following the codebase convention established in the recent refactor:

| Term         | Meaning                                         |
| ------------ | ----------------------------------------------- |
| `Field`      | Raw type constraint (`{ type: 'text', ... }`)   |
| `Definition` | Metadata + Field(s)                             |
| `Schema`     | Reserved for full workspace or validation logic |

For KV entries, the property is `field` (not `schema`):

```typescript
// KV entry structure
{
  name: 'Theme',
  icon: 'emoji:🎨',
  description: '...',
  field: { type: 'select', options: ['light', 'dark'] },  // Field definition
  value: 'dark'                                           // Current value
}
```

This matches the existing `KvDefinition` type which has a `field` property.

---

## Icon Storage

Icons are stored as **tagged strings** throughout the system—no encoding/decoding needed:

```typescript
// Tagged string format: "{type}:{value}"
type Icon = `emoji:${string}` | `lucide:${string}` | `url:${string}`;

// Examples
const emojiIcon: Icon = 'emoji:📝';
const lucideIcon: Icon = 'lucide:file-text';
const urlIcon: Icon = 'url:https://example.com/icon.png';
```

**Why tagged strings everywhere:**

1. **LWW-safe**: If icon were `{ type: 'emoji', value: '📝' }` as nested Y.Map, concurrent edits could create invalid states (e.g., `{ type: 'emoji', value: 'file-text' }`). With tagged strings, LWW produces a valid icon—one wins, but it's always coherent.

2. **No transformation layer**: The value in YJS is the same as the value in TypeScript. No encode/decode functions to maintain.

3. **Type-safe at compile time**: TypeScript template literal types catch invalid icons:

   ```typescript
   const bad: Icon = 'invalid:foo'; // Type error!
   const good: Icon = 'emoji:📝'; // OK
   ```

4. **Easy parsing when needed**: Simple string split for rendering:
   ```typescript
   const [type, value] = icon.split(':') as [
   	'emoji' | 'lucide' | 'url',
   	string,
   ];
   ```

---

## ID Strategy

| Entity    | Format                | Example             | Rationale                                      |
| --------- | --------------------- | ------------------- | ---------------------------------------------- |
| Workspace | User-provided or UUID | `ws-abc123`         | Human-readable when possible                   |
| Epoch     | Integer from 0        | `0`, `1`, `2`       | Simple incrementing version                    |
| Table     | UUID/ULID             | `tbl-550e8400`      | Prevents LWW on concurrent creation            |
| Row       | UUID/ULID             | `row-6ba7b810`      | Prevents LWW on concurrent creation            |
| Field     | Slug or UUID          | `title`, `fld-abc`  | Slugs for code-defined, UUIDs for user-created |
| KV Key    | Slug                  | `theme`, `fontSize` | Always code-defined                            |

---

## Persistence Strategy

### File Layout

```
workspace/
├── workspace.yjs          # Source of truth (full co-located Y.Doc)
│
├── definition.json        # Materialized: meta + table defs + kv defs
├── tables.sqlite          # Materialized: row data only
└── kv.json                # Materialized: kv values only
```

Or with epochs:

```
workspace/
├── head.yjs               # Epoch pointer (optional)
├── epochs/
│   ├── 0.yjs              # Epoch 0 workspace doc
│   └── 1.yjs              # Epoch 1 workspace doc
│
├── definition.json        # Materialized: current epoch definitions
├── tables.sqlite          # Materialized: current epoch row data
└── kv.json                # Materialized: current epoch kv values
```

### What Gets Written Where

| YJS Path               | Materialized To   | Content                           |
| ---------------------- | ----------------- | --------------------------------- |
| `meta.*`               | `definition.json` | Workspace name, icon, description |
| `tables.{name}.name`   | `definition.json` | Table display name                |
| `tables.{name}.icon`   | `definition.json` | Table icon                        |
| `tables.{name}.fields` | `definition.json` | Field definitions                 |
| `tables.{name}.rows`   | `tables.sqlite`   | Row data                          |
| `kv.{key}.name`        | `definition.json` | KV display name                   |
| `kv.{key}.field`       | `definition.json` | KV field definition               |
| `kv.{key}.value`       | `kv.json`         | KV current value                  |

### definition.json

All definitions in one human-readable file:

```json
{
	"meta": {
		"name": "My Blog",
		"icon": "emoji:📝",
		"description": "Personal blog workspace"
	},
	"tables": {
		"posts": {
			"name": "Posts",
			"icon": "emoji:📄",
			"description": "Blog posts",
			"fields": {
				"id": { "type": "id" },
				"title": { "type": "text" },
				"published": { "type": "boolean", "default": false }
			}
		},
		"users": {
			"name": "Users",
			"icon": "lucide:user",
			"fields": {
				"id": { "type": "id" },
				"email": { "type": "text" }
			}
		}
	},
	"kv": {
		"theme": {
			"name": "Theme",
			"icon": "emoji:🎨",
			"field": {
				"type": "select",
				"options": ["light", "dark"],
				"default": "light"
			}
		},
		"fontSize": {
			"name": "Font Size",
			"field": { "type": "integer", "default": 14 }
		}
	}
}
```

### tables.sqlite

Row data only—one SQLite table per YJS table:

```sql
-- tables.sqlite

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  title TEXT,
  content TEXT,
  published INTEGER
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT,
  name TEXT
);
```

### kv.json

KV values only—flat map:

```json
{
	"theme": "dark",
	"fontSize": 16
}
```

### Sync Strategy: Debounced Pull-Down

```typescript
// On any Y.Map change, debounce and materialize
ydoc.on('update', () => {
	debouncedSync(); // 100-500ms debounce
});

async function syncToFiles() {
	// 1. Materialize definitions
	const definition = {
		meta: metaYMap.toJSON(),
		tables: Object.fromEntries(
			[...tablesYMap.entries()].map(([name, table]) => [
				name,
				{
					name: table.get('name'),
					icon: table.get('icon'),
					description: table.get('description'),
					fields: table.get('fields').toJSON(),
				},
			]),
		),
		kv: Object.fromEntries(
			[...kvYMap.entries()].map(([key, entry]) => [
				key,
				{
					name: entry.get('name'),
					icon: entry.get('icon'),
					description: entry.get('description'),
					field: entry.get('field'),
				},
			]),
		),
	};
	await writeFile('definition.json', JSON.stringify(definition, null, 2));

	// 2. Materialize KV values
	const kvValues = Object.fromEntries(
		[...kvYMap.entries()].map(([key, entry]) => [key, entry.get('value')]),
	);
	await writeFile('kv.json', JSON.stringify(kvValues, null, 2));

	// 3. Materialize table rows to SQLite
	for (const [tableName, tableYMap] of tablesYMap.entries()) {
		const rows = tableYMap.get('rows').toJSON();
		await db.run(`DROP TABLE IF EXISTS ${tableName}`);
		await db.run(`CREATE TABLE ${tableName} (...)`);
		for (const [rowId, row] of Object.entries(rows)) {
			await db.run(`INSERT INTO ${tableName} ...`, { id: rowId, ...row });
		}
	}
}
```

**Why this approach:**

1. **Simple**: No incremental diffing, no conflict resolution with files
2. **Correct**: YJS is always source of truth; files are just views
3. **Fast enough**: For small-medium workspaces, full rebuild is < 100ms
4. **Inspectable**: Can `cat` the JSON files, query SQLite directly

---

## TypeScript Types

```typescript
// ─────────────────────────────────────────────────────────────────────────────
// Icon Type (tagged string)
// ─────────────────────────────────────────────────────────────────────────────

/** Tagged string icon format. */
type Icon = `emoji:${string}` | `lucide:${string}` | `url:${string}`;

// ─────────────────────────────────────────────────────────────────────────────
// Top-Level Y.Map Types
// ─────────────────────────────────────────────────────────────────────────────

/** Y.Map storing workspace metadata. */
type MetaYMap = Y.Map<unknown>;

/** Y.Map storing all tables, keyed by table ID. */
type TablesYMap = Y.Map<TableYMap>;

/** Y.Map storing all KV entries, keyed by key name. */
type KvYMap = Y.Map<KvEntryYMap>;

// ─────────────────────────────────────────────────────────────────────────────
// Table Y.Map Types
// ─────────────────────────────────────────────────────────────────────────────

/** Y.Map for a single table (metadata + fields + rows). */
type TableYMap = Y.Map<unknown>;

/** Y.Map storing field definitions for a table. */
type FieldsYMap = Y.Map<Field>;

/** Y.Map storing rows for a table, keyed by row ID. */
type RowsYMap = Y.Map<RowYMap>;

/** Y.Map storing cell values for a single row. */
type RowYMap = Y.Map<unknown>;

// ─────────────────────────────────────────────────────────────────────────────
// KV Y.Map Types
// ─────────────────────────────────────────────────────────────────────────────

/** Y.Map for a single KV entry (metadata + field + value). */
type KvEntryYMap = Y.Map<unknown>;

// ─────────────────────────────────────────────────────────────────────────────
// Plain Object Types (for toJSON())
// ─────────────────────────────────────────────────────────────────────────────

type WorkspaceMeta = {
	name: string;
	icon: Icon | null;
	description: string;
};

type TableEntry = {
	name: string;
	icon: Icon | null;
	description: string;
	createdAt: number;
	deletedAt: number | null;
	fields: Record<string, Field>;
	rows: Record<string, Record<string, unknown>>;
};

type KvEntry = {
	name: string;
	icon: Icon | null;
	description: string;
	field: KvField;
	value: unknown;
};
```

---

## API Design

The API mirrors the YJS structure—co-located, intuitive, everything about a table in one place.

### Workspace Access

```typescript
const workspace = createWorkspace({ id: 'ws-123' });

// Metadata
workspace.meta.name;                    // 'My Blog'
workspace.meta.setName('New Name');
workspace.meta.icon;                    // 'emoji:📝'
workspace.meta.setIcon('lucide:book');

// Tables (callable collection)
workspace.tables('posts');              // TableHelper | undefined
workspace.tables.keys();                // ['posts', 'users']
workspace.tables.has('posts');          // true
workspace.tables.create('comments', { name: 'Comments', fields: {...} });
workspace.tables.delete('oldTable');
```

### Table Access

```typescript
const posts = workspace.tables('posts');

// Metadata (getters + setters)
posts.name; // 'Posts'
posts.setName('Blog Posts');
posts.icon; // 'emoji:📝'
posts.setIcon('lucide:file-text');

// Fields (collection)
posts.fields.get('title'); // Field | undefined
posts.fields.set('dueDate', date());
posts.fields.delete('legacyField');
posts.fields.keys(); // ['id', 'title', 'content']

// Rows (CRUD)
posts.rows.upsert({ id: '1', title: 'Hello' });
posts.rows.get({ id: '1' }); // RowResult
posts.rows.update({ id: '1', title: 'Updated' });
posts.rows.delete({ id: '1' });
posts.rows.getAll(); // RowResult[]
posts.rows.filter((r) => r.published);
```

### KV Access

```typescript
// KV (callable collection)
workspace.kv('theme'); // KvHelper | undefined
workspace.kv.keys(); // ['theme', 'fontSize']
workspace.kv.has('theme'); // true

// Single KV entry
const theme = workspace.kv('theme');
theme.name; // 'Theme'
theme.field; // { type: 'select', options: [...] }
theme.value; // 'dark'
theme.set('light');
theme.reset(); // Back to default
```

### Observation Patterns

The co-located structure enables granular observation:

```typescript
const posts = workspace.tables('posts');

// Watch table metadata only (name, icon, description changes)
posts.observeMetadata(() => {
	updateSidebarUI();
});

// Watch fields only (schema changes)
posts.fields.observe((changes) => {
	rebuildTableColumns();
});

// Watch rows only (data changes)
posts.rows.observe((changes) => {
	// Incremental: only the rows that changed
	syncChangedRowsToSQLite(changes);
});

// Watch everything about this table
posts.observeDeep(() => {
	// Any change: metadata, fields, or rows
	fullTableRebuild();
});

// Watch all tables (add/remove)
workspace.tables.observe((changes) => {
	// A table was added or removed
	rebuildSidebar();
});
```

---

## Migration from Current Architecture

### What Changes

| Current (Multi-Doc)            | New (Single Doc)                         |
| ------------------------------ | ---------------------------------------- |
| `Y.Map('definition')` separate | Fields co-located in each table          |
| `Y.Map('tables')` = rows only  | `Y.Map('tables')` = meta + fields + rows |
| `Y.Map('kv')` = values only    | `Y.Map('kv')` = meta + field + value     |
| Head Doc for identity          | `Y.Map('meta')` in same doc              |
| Multiple docs per workspace    | Single doc per workspace                 |

### Migration Steps

1. **Create new doc structure** with combined format
2. **Copy table definitions** from `definition.tables` → each table's `fields`
3. **Copy table rows** from `tables.{name}.rows` → each table's `rows`
4. **Copy KV definitions** from `definition.kv` → each KV entry's `field`
5. **Copy KV values** from `kv` → each KV entry's `value`
6. **Copy workspace meta** from Head Doc → `meta`

### Backward Compatibility

The old multi-doc structure and new single-doc structure are incompatible.
Migration requires a full data copy (epoch bump).

---

## Open Questions

- [ ] **Field ordering**: Y.Array for order, or `order` field in each Field?
- [ ] **Row ordering**: Same question for user-defined row order
- [ ] **Compaction timing**: When to trigger epoch bump for doc size management?
- [ ] **Maximum workspace size**: At what point should we recommend multi-doc?

---

## References

- [Y.js Documentation](https://docs.yjs.dev/)
- [Multi-Doc Architecture Spec](./20260122T225052-subdoc-architecture.md)
- [Current workspace implementation](../../packages/epicenter/src/core/docs/workspace-doc.ts)
