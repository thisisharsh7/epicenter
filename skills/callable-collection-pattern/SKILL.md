# Callable Collection Pattern

A TypeScript pattern for type-safe, namespace-preserving collection accessors with support for nested structures.

## The Problem

You want to provide typed access to a collection (like tables, fields, settings) where:

1. Users can access items by key: `collection.posts` or `collection['posts']`
2. You need utility methods: `collection.toJSON()`, `collection.keys()`, `collection.observe()`
3. Keys are dynamic strings, not known at compile time

The **conflict**: If you use an object with properties, your utility methods (`toJSON`, `keys`, `set`) **collide** with potential item keys. What if someone creates a table named `toJSON`?

```typescript
// Problem: namespace collision
collection.toJSON(); // utility method? or item named "toJSON"?
collection.keys(); // utility method? or item named "keys"?
```

## The Solution

Make the collection **callable**. Item access goes through the function call, utility methods go on properties.

```
collection('posts')     -> item helper (or undefined)
collection.get('posts') -> item snapshot (for when you don't need the helper)
collection.has('posts') -> existence check
collection.toJSON()     -> all items as JSON
collection.keys()       -> list of keys
collection.entries()    -> [key, value] pairs
collection.set(k, v)    -> add/update item
collection.delete(k)    -> remove item
collection.observe(cb)  -> watch for changes
```

No collision possible. `collection('toJSON')` and `collection.toJSON()` are unambiguous.

## When to Use Callable vs Collection-Style

The key heuristic: **Callable only where nesting is needed.**

| Pattern                          | Use When                                      |
| -------------------------------- | --------------------------------------------- |
| **Callable** `collection('key')` | Item helper has nested collections or methods |
| **Collection-style** `.get(key)` | Items are leaf nodes (no further nesting)     |

### Why This Matters

Callable access returns a **capability-bearing helper** (with methods, observation, nested collections), not just data. If the item has no nested structure, a helper adds no value.

```typescript
// Tables ARE callable: the helper has nested .fields collection
const posts = definition.tables('posts');
posts?.fields.set('dueDate', date()); // Helper enables nested access
posts?.setName('Blog Posts'); // Helper has methods

// Fields are NOT callable: they're leaf nodes, just data
const titleSchema = definition.tables('posts')?.fields.get('title');
// titleSchema is just a FieldSchema object, no nested collections

// If fields DID have nesting, it would look like:
// fields('title')?.validators.get('required')  // But they don't!
```

## Fixed Keys vs Dynamic Keys

Different patterns for different scenarios:

| Key Type                            | Read                                                     | Write                       |
| ----------------------------------- | -------------------------------------------------------- | --------------------------- |
| **Dynamic + nested** (tables, kv)   | `collection('key')` for helper, `.get(key)` for snapshot | `.set(key, value)`          |
| **Dynamic + leaf** (fields)         | `.get(key)` only                                         | `.set(key, value)`          |
| **Fixed** (name, icon, description) | Property getter: `.name`                                 | Method setter: `.setName()` |

### Why Property Getters for Fixed Keys?

```typescript
// Property getters feel natural for known fields
table.name; // "Posts"
table.icon; // { type: 'emoji', value: '📝' }
table.description; // "Blog posts"

// Asymmetric setters make mutation explicit
table.setName('Blog Posts');
table.setIcon({ type: 'emoji', value: '✍️' });
```

## The Complete Pattern

```
definition
├── .toJSON()                       -> WorkspaceDefinitionMap
├── .merge({ tables?, kv? })        -> void
├── .observe(cb)                    -> unsubscribe
│
├── .tables(name)                   -> TableHelper | undefined (callable: has nested .fields)
├── .tables.get(name)               -> TableDefinition | undefined (snapshot)
├── .tables.has(name)               -> boolean
├── .tables.toJSON()                -> Record<string, TableDefinition>
├── .tables.keys()                  -> string[]
├── .tables.entries()               -> [string, TableDefinition][]
├── .tables.set(name, def)          -> void
├── .tables.delete(name)            -> boolean
└── .tables.observe(cb)             -> unsubscribe

definition.tables('posts')          -> TableHelper
├── .name                           -> string (property getter)
├── .icon                           -> IconDefinition | null (property getter)
├── .description                    -> string (property getter)
├── .setName(v)                     -> void
├── .setIcon(v)                     -> void
├── .setDescription(v)              -> void
├── .toJSON()                       -> TableDefinition
├── .set(def)                       -> void
├── .delete()                       -> boolean
├── .observe(cb)                    -> unsubscribe
└── .fields                         -> FieldsCollection (NOT callable: fields are leaf nodes)
    ├── .get(name)                  -> FieldSchema | undefined
    ├── .has(name)                  -> boolean
    ├── .toJSON()                   -> Record<string, FieldSchema>
    ├── .keys()                     -> string[]
    ├── .entries()                  -> [string, FieldSchema][]
    ├── .set(name, schema)          -> void
    ├── .delete(name)               -> boolean
    └── .observe(cb)                -> unsubscribe
```

## TypeScript Implementation

```typescript
// Callable collection type (for items with nested access)
type TablesCollection = {
	(tableName: string): TableHelper | undefined; // Call signature
	get(tableName: string): TableDefinition | undefined;
	has(tableName: string): boolean;
	toJSON(): Record<string, TableDefinition>;
	keys(): string[];
	entries(): [string, TableDefinition][];
	set(tableName: string, definition: TableDefinition): void;
	delete(tableName: string): boolean;
	observe(cb: (changes: Map<string, 'add' | 'delete'>) => void): () => void;
};

// Collection-style type (for leaf nodes)
type FieldsCollection = {
	get(fieldName: string): FieldSchema | undefined;
	has(fieldName: string): boolean;
	toJSON(): Record<string, FieldSchema>;
	keys(): string[];
	entries(): [string, FieldSchema][];
	set(fieldName: string, schema: FieldSchema): void;
	delete(fieldName: string): boolean;
	observe(
		cb: (changes: Map<string, 'add' | 'update' | 'delete'>) => void,
	): () => void;
};

// Create callable collection using Object.assign
function createTablesCollection(store: Y.Map<unknown>): TablesCollection {
	const accessor = (key: string): TableHelper | undefined => {
		if (!store.has(key)) return undefined;
		return createTableHelper(store, key);
	};

	return Object.assign(accessor, {
		get(key: string) {
			/* ... */
		},
		has(key: string) {
			/* ... */
		},
		toJSON() {
			/* ... */
		},
		keys() {
			/* ... */
		},
		entries() {
			/* ... */
		},
		set(key: string, value: TableDefinition) {
			/* ... */
		},
		delete(key: string) {
			/* ... */
		},
		observe(cb) {
			/* ... */
		},
	});
}
```

## Usage Examples

```typescript
// Check if table exists
if (definition.tables.has('posts')) {
	// exists
}

// Or use callable with truthiness check
if (definition.tables('posts')) {
	// exists and get helper
}

// Get table snapshot (no helper)
const postsSnapshot = definition.tables.get('posts');

// Get table helper (for nested access)
const postsHelper = definition.tables('posts');
if (postsHelper) {
	// Access fixed properties
	console.log(postsHelper.name); // "Posts"
	console.log(postsHelper.icon); // { type: 'emoji', value: '📝' }

	// Mutate fixed properties
	postsHelper.setName('Blog Posts');
	postsHelper.setIcon({ type: 'emoji', value: '✍️' });

	// Access fields (collection-style, NOT callable)
	const titleSchema = postsHelper.fields.get('title');
	postsHelper.fields.set('dueDate', date({ nullable: true }));
	postsHelper.fields.delete('legacyField');
}

// Iterate over all tables
for (const [name, def] of definition.tables.entries()) {
	console.log(name, def.fields);
}

// Bulk operations
const allTables = definition.tables.toJSON();
const tableNames = definition.tables.keys();
definition.tables.observe((changes) => {
	/* ... */
});
```

## When to Use

**Use callable pattern when:**

- Collection items have nested collections or complex operations
- You need both helper objects AND snapshot access
- Keys are dynamic strings that could collide with method names

**Use collection-style when:**

- Items are leaf nodes (no further nesting needed)
- Simple get/set/delete semantics suffice
- No need for per-item helpers

**Use property getters for:**

- Fixed, known keys (name, icon, description)
- Fields that are frequently read but rarely written
- Cleaner syntax for common access patterns

## Summary

| Want to...                    | Pattern                                                     |
| ----------------------------- | ----------------------------------------------------------- |
| Get item helper (for nesting) | `collection('key')`                                         |
| Get item snapshot             | `collection.get('key')`                                     |
| Check existence               | `collection.has('key')`                                     |
| Get all snapshots             | `collection.toJSON()`                                       |
| Get all entries               | `collection.entries()`                                      |
| Set item                      | `collection.set('key', value)`                              |
| Delete item                   | `collection.delete('key')` or `collection('key')?.delete()` |
| List keys                     | `collection.keys()`                                         |
| Read fixed property           | `helper.name`, `helper.icon`                                |
| Write fixed property          | `helper.setName()`, `helper.setIcon()`                      |
| Observe changes               | `collection.observe(cb)`                                    |
