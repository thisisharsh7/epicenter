# The Callable Collection Pattern in TypeScript

A pattern for type-safe collection APIs that avoids namespace collisions and supports nested structures.

> **TL;DR**: The core insight is simple: lift `.get()` to be the call signature itself. See [The Callable Collection Insight](./callable-collection-insight.md) for the 30-second version.

> **Update**: After consideration, we now recommend **preferring `.get()` over the callable pattern** in most cases. The callable pattern is documented here for completeness, but explicit method calls are more discoverable, familiar, and consistent with standard library conventions. See the [insight article](./callable-collection-insight.md#our-recommendation-prefer-get) for reasoning.

## The Problem

When building collection APIs, you often want both:

1. **Item access by key**: Get a specific item from the collection
2. **Utility methods**: Operations on the collection itself (serialize, list keys, observe)

The naive approach creates a collision:

```typescript
// What if someone creates a table named "toJSON"?
tables.posts; // item access
tables.toJSON(); // utility method... or item named "toJSON"?
```

### Common (Flawed) Solutions

**Prefix utilities with `$`**:

```typescript
tables.posts; // item
tables.$toJSON(); // utility
tables.$keys(); // utility
```

Ugly. Breaks autocomplete UX. Still reserves namespace.

**Use a Proxy**:

```typescript
new Proxy(items, {
	get(target, key) {
		if (key === 'toJSON') return () => serialize(target);
		return target[key];
	},
});
```

Magic. Hard to debug. TypeScript types are painful.

**Separate accessor object**:

```typescript
tables.items.posts; // item
tables.toJSON(); // utility
```

Verbose. Awkward nested access.

## The Solution: Callable Collections

Make the collection itself a **function**. Item access goes through the call, utilities go on properties.

```
tables('posts')     -> item helper (or undefined if missing)
tables.get('posts') -> item snapshot (when you don't need the helper)
tables.has('posts') -> check existence
tables.toJSON()     -> all items as JSON
tables.keys()       -> list of keys
```

**No collision possible.** `tables('toJSON')` and `tables.toJSON()` are syntactically distinct.

## The Key Heuristic: Callable Only Where Nesting Is Needed

Not everything should be callable. The decision procedure:

1. **Will the returned thing have nested collections or methods?** → Make it callable
2. **Is the returned thing just data (a leaf node)?** → Use `.get()` only

Callable access returns a **capability-bearing helper** (with methods, observation, nested collections), not just data. If the item has no nested structure, a helper adds no value.

| Item Type              | Pattern                                            | Reason                                     |
| ---------------------- | -------------------------------------------------- | ------------------------------------------ |
| Has nested collections | **Callable** `collection('key')` _and_ `.get(key)` | Callable for helper, `.get()` for snapshot |
| Leaf node (no nesting) | **Collection-style** `.get(key)` only              | Just returns the data, no helper needed    |

```typescript
// Tables ARE callable: the helper has nested .fields collection
const posts = definition.tables('posts');
posts?.fields.set('dueDate', date()); // Helper enables nested access
posts?.setName('Blog Posts'); // Helper has methods

// But tables ALSO have .get() for when you just want the snapshot
const postsSnapshot = definition.tables.get('posts'); // Plain TableDefinition

// Fields are NOT callable: they're leaf nodes, just data
const titleSchema = definition.tables('posts')?.fields.get('title');
// titleSchema is a FieldSchema object; no nested collections, no helper needed
```

## Fixed Keys vs Dynamic Keys

Use different patterns based on whether keys are known at compile time:

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

The asymmetry is intentional: reads are frequent, writes are deliberate.

## The Complete API Shape

```
definition
├── .toJSON()                       -> WorkspaceDefinitionMap
├── .merge({ tables?, kv? })        -> void
├── .observe(cb)                    -> unsubscribe
│
├── .tables(name)                   -> TableHelper | undefined (callable)
├── .tables.get(name)               -> TableDefinition | undefined
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
├── .setName(v)                     -> void (method setter)
├── .setIcon(v)                     -> void
├── .setDescription(v)              -> void
├── .toJSON()                       -> TableDefinition
├── .set(def)                       -> void
├── .delete()                       -> boolean
├── .observe(cb)                    -> unsubscribe
└── .fields                         -> FieldsCollection (NOT callable)
    ├── .get(name)                  -> FieldSchema | undefined
    ├── .has(name)                  -> boolean
    ├── .toJSON()                   -> Record<string, FieldSchema>
    ├── .keys()                     -> string[]
    ├── .entries()                  -> [string, FieldSchema][]
    ├── .set(name, schema)          -> void
    ├── .delete(name)               -> boolean
    └── .observe(cb)                -> unsubscribe
```

## Implementation

TypeScript supports callable objects via call signatures in type definitions:

```typescript
// Callable collection type
type TablesCollection = {
	// Call signature: makes the object callable
	(tableName: string): TableHelper | undefined;

	// Properties: utilities on the collection
	get(tableName: string): TableDefinition | undefined;
	has(tableName: string): boolean;
	toJSON(): Record<string, TableDefinition>;
	keys(): string[];
	entries(): [string, TableDefinition][];
	set(tableName: string, definition: TableDefinition): void;
	delete(tableName: string): boolean;
	observe(
		callback: (changes: Map<string, 'add' | 'delete'>) => void,
	): () => void;
};

// Collection-style type (for leaf nodes like fields)
type FieldsCollection = {
	get(fieldName: string): FieldSchema | undefined;
	has(fieldName: string): boolean;
	toJSON(): Record<string, FieldSchema>;
	keys(): string[];
	entries(): [string, FieldSchema][];
	set(fieldName: string, schema: FieldSchema): void;
	delete(fieldName: string): boolean;
	observe(
		callback: (changes: Map<string, 'add' | 'update' | 'delete'>) => void,
	): () => void;
};
```

Create callable collections using `Object.assign`:

```typescript
function createTablesCollection(store: Y.Map<unknown>): TablesCollection {
	// The accessor function
	const accessor = (key: string): TableHelper | undefined => {
		if (!store.has(key)) return undefined;
		return createTableHelper(store, key);
	};

	// Attach properties
	return Object.assign(accessor, {
		get(key: string) {
			const map = store.get(key);
			if (!map) return undefined;
			return serializeTableDefinition(map);
		},
		has(key: string) {
			return store.has(key);
		},
		toJSON() {
			return Object.fromEntries(
				Array.from(store.entries()).map(([k, v]) => [
					k,
					serializeTableDefinition(v),
				]),
			);
		},
		keys() {
			return Array.from(store.keys());
		},
		entries() {
			return Array.from(store.entries()).map(([k, v]) => [
				k,
				serializeTableDefinition(v),
			]);
		},
		set(key: string, value: TableDefinition) {
			// ... set logic
		},
		delete(key: string) {
			if (!store.has(key)) return false;
			store.delete(key);
			return true;
		},
		observe(callback) {
			// ... observation logic
			return () => {
				/* unsubscribe */
			};
		},
	});
}
```

## Usage Examples

```typescript
// Check existence (two ways)
if (definition.tables.has('posts')) {
	/* ... */
}
if (definition.tables('posts')) {
	/* ... */
}

// Get snapshot without helper
const postsSnapshot = definition.tables.get('posts');

// Get helper for nested access
const postsHelper = definition.tables('posts');
if (postsHelper) {
	// Read fixed properties (property getters)
	console.log(postsHelper.name); // "Posts"
	console.log(postsHelper.icon); // { type: 'emoji', value: '📝' }
	console.log(postsHelper.description); // "Blog posts"

	// Write fixed properties (method setters)
	postsHelper.setName('Blog Posts');
	postsHelper.setIcon({ type: 'emoji', value: '✍️' });

	// Access fields (collection-style, NOT callable)
	const titleSchema = postsHelper.fields.get('title');
	if (postsHelper.fields.has('dueDate')) {
		postsHelper.fields.delete('dueDate');
	}
	postsHelper.fields.set('publishedAt', date({ nullable: true }));

	// Iterate fields
	for (const [name, schema] of postsHelper.fields.entries()) {
		console.log(name, schema.type);
	}
}

// Bulk operations on tables
const allTables = definition.tables.toJSON();
const tableNames = definition.tables.keys();
for (const [name, def] of definition.tables.entries()) {
	console.log(name, Object.keys(def.fields).length, 'fields');
}

// Observe changes
const unsubscribe = definition.tables.observe((changes) => {
	for (const [name, action] of changes) {
		// action is 'add' or 'delete'
		console.log(`Table ${name}: ${action}`);
	}
});
```

## Design Decisions

### `.get()` vs Callable

Use both:

- **Callable** when you need the helper object for further operations
- **`.get()`** when you just want the data snapshot

```typescript
// Get helper to access nested .fields
const helper = definition.tables('posts');
helper?.fields.set('newField', text());

// Get snapshot when you just need the data
const snapshot = definition.tables.get('posts');
console.log(snapshot?.name);
```

### `.has()` for Explicit Existence Checks

While you can check existence with `if (collection('key'))`, `.has()` is more explicit:

```typescript
// Explicit
if (definition.tables.has('posts')) {
	/* ... */
}

// Also works, but creates a helper unnecessarily
if (definition.tables('posts')) {
	/* ... */
}
```

### Why Fields Aren't Callable

Fields are leaf nodes. There's no `.subfields` or nested structure. Making them callable would add complexity without benefit:

```typescript
// This would be redundant
definition.tables('posts')?.fields('title')?.toJSON(); // Just to get the schema?

// Collection-style is cleaner for leaf nodes
definition.tables('posts')?.fields.get('title'); // Returns FieldSchema directly
```

### Why Property Getters for Fixed Keys

Fixed keys like `name`, `icon`, `description` are known at compile time and commonly accessed:

```typescript
// Natural syntax for frequent reads
table.name;
table.icon;

// vs clunky method calls
table.getName();
table.getIcon();
```

The asymmetric setter (`setName()` instead of `name =`) makes mutation deliberate.

## When to Use This Pattern

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

## Why Not Proxies?

Proxies can achieve similar results but have drawbacks:

1. **TypeScript pain**: Typing proxies correctly is complex
2. **Debugging**: Proxy behavior is harder to trace
3. **Performance**: Proxies have overhead (though usually negligible)
4. **Explicitness**: Function calls are more explicit than property access

The callable pattern is simpler, explicit, and has excellent TypeScript support.

## Summary

| Want to...                    | Pattern                        |
| ----------------------------- | ------------------------------ |
| Get item helper (for nesting) | `collection('key')`            |
| Get item snapshot             | `collection.get('key')`        |
| Check existence               | `collection.has('key')`        |
| Get all snapshots             | `collection.toJSON()`          |
| Get all entries               | `collection.entries()`         |
| Set item                      | `collection.set('key', value)` |
| Delete item                   | `collection.delete('key')`     |
| List keys                     | `collection.keys()`            |
| Read fixed property           | `helper.name`                  |
| Write fixed property          | `helper.setName(value)`        |
| Observe changes               | `collection.observe(cb)`       |

The Callable Collection Pattern provides a clean, type-safe API for hierarchical data structures while avoiding namespace collisions and maintaining excellent developer ergonomics.
