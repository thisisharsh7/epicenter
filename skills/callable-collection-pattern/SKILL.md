# Collection Access Pattern

A TypeScript pattern for type-safe, namespace-preserving collection accessors.

> **TL;DR**: Use `.get()` for accessing collection items. It's explicit, familiar (Map, WeakMap, ORMs all use it), and discoverable. The callable pattern (`collection('key')`) exists as an alternative but adds cognitive load for minimal benefit.

> **Default Recommendation**: Always use `.get()` unless you have a specific reason not to. The callable pattern is documented here for historical context and edge cases where it may still be preferred.

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

Use a **collection object with methods**. Item access goes through `.get()`, utility methods are other properties.

```
collection.get('posts') -> item (helper or snapshot)
collection.has('posts') -> existence check
collection.toJSON()     -> all items as JSON
collection.keys()       -> list of keys
collection.entries()    -> [key, value] pairs
collection.set(k, v)    -> add/update item
collection.delete(k)    -> remove item
collection.observe(cb)  -> watch for changes
```

No collision possible. `collection.get('toJSON')` and `collection.toJSON()` are unambiguous.

### Historical Alternative: Callable Pattern

The callable pattern lifts `.get()` to be the call signature itself: `collection('posts')` instead of `collection.get('posts')`. This saves 4 characters but adds cognitive load. **Prefer `.get()` by default.**

## When to Use Each Pattern

**Default: Use `.get()` for everything.** It's explicit, familiar, and consistent.

| Pattern                     | Recommendation                            |
| --------------------------- | ----------------------------------------- |
| **`.get(key)`** (preferred) | Use by default for all collection access  |
| **`collection('key')`**     | Historical alternative; avoid in new code |

### What `.get()` Returns

`.get()` can return either a **snapshot** (plain data) or a **helper** (object with methods/nested collections). The return type depends on what makes sense for your use case:

```typescript
// .get() returning a helper (has nested .fields collection and methods)
const posts = definition.tables.get('posts');
posts?.fields.set('dueDate', date()); // Helper enables nested access
posts?.setName('Blog Posts'); // Helper has methods

// .get() returning a snapshot (leaf node, just data)
const titleSchema = definition.tables.get('posts')?.fields.get('title');
// titleSchema is just a FieldSchema object, no nested collections
```

## Fixed Keys vs Dynamic Keys

Different patterns for different scenarios:

| Key Type                            | Read                     | Write                       |
| ----------------------------------- | ------------------------ | --------------------------- |
| **Dynamic** (tables, fields, kv)    | `.get(key)`              | `.set(key, value)`          |
| **Fixed** (name, icon, description) | Property getter: `.name` | Method setter: `.setName()` |

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
├── .tables.get(name)               -> TableHelper | undefined
├── .tables.has(name)               -> boolean
├── .tables.toJSON()                -> Record<string, TableDefinition>
├── .tables.keys()                  -> string[]
├── .tables.entries()               -> [string, TableDefinition][]
├── .tables.set(name, def)          -> void
├── .tables.delete(name)            -> boolean
└── .tables.observe(cb)             -> unsubscribe

definition.tables.get('posts')      -> TableHelper
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
└── .fields                         -> FieldsCollection
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
// Standard collection type (preferred)
type TablesCollection = {
	get(tableName: string): TableHelper | undefined;
	has(tableName: string): boolean;
	toJSON(): Record<string, TableDefinition>;
	keys(): string[];
	entries(): [string, TableDefinition][];
	set(tableName: string, definition: TableDefinition): void;
	delete(tableName: string): boolean;
	observe(cb: (changes: Map<string, 'add' | 'delete'>) => void): () => void;
};

// Collection type for leaf nodes
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

// Create collection
function createTablesCollection(store: Y.Map<unknown>): TablesCollection {
	return {
		get(key: string): TableHelper | undefined {
			if (!store.has(key)) return undefined;
			return createTableHelper(store, key);
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
	};
}
```

### Historical: Callable Collection Type

If you need the callable pattern for legacy code or specific use cases:

```typescript
// Callable collection type (historical alternative)
type CallableTablesCollection = {
	(tableName: string): TableHelper | undefined; // Call signature
	get(tableName: string): TableHelper | undefined;
	has(tableName: string): boolean;
	// ... other methods
};

// Create using Object.assign
function createCallableCollection(
	store: Y.Map<unknown>,
): CallableTablesCollection {
	const accessor = (key: string): TableHelper | undefined => {
		if (!store.has(key)) return undefined;
		return createTableHelper(store, key);
	};

	return Object.assign(accessor, {
		get: accessor, // Same implementation as call signature
		has(key: string) {
			/* ... */
		},
		// ... other methods
	});
}
```

## Usage Examples

```typescript
// Check if table exists
if (definition.tables.has('posts')) {
	// exists
}

// Get table helper
const posts = definition.tables.get('posts');
if (posts) {
	// Access fixed properties
	console.log(posts.name); // "Posts"
	console.log(posts.icon); // { type: 'emoji', value: '📝' }

	// Mutate fixed properties
	posts.setName('Blog Posts');
	posts.setIcon({ type: 'emoji', value: '✍️' });

	// Access nested fields collection
	const titleSchema = posts.fields.get('title');
	posts.fields.set('dueDate', date({ nullable: true }));
	posts.fields.delete('legacyField');
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

**Use `.get()` pattern (default):**

- All collection access, regardless of whether items have nesting
- Explicit, familiar, consistent with Map/WeakMap/ORMs
- Easy to understand and discoverable in IDE

**Use property getters for:**

- Fixed, known keys (name, icon, description)
- Fields that are frequently read but rarely written
- Cleaner syntax for common access patterns

**Consider callable pattern only when:**

- Maintaining legacy code that already uses it
- Extreme verbosity is a genuine pain point (rare)
- You've explicitly decided the tradeoff is worth it

## Summary

| Want to...           | Pattern                                |
| -------------------- | -------------------------------------- |
| Get item             | `collection.get('key')`                |
| Check existence      | `collection.has('key')`                |
| Get all as object    | `collection.toJSON()`                  |
| Get all entries      | `collection.entries()`                 |
| Set item             | `collection.set('key', value)`         |
| Delete item          | `collection.delete('key')`             |
| List keys            | `collection.keys()`                    |
| Read fixed property  | `helper.name`, `helper.icon`           |
| Write fixed property | `helper.setName()`, `helper.setIcon()` |
| Observe changes      | `collection.observe(cb)`               |
