# Callable Collection Pattern

A TypeScript pattern for type-safe, namespace-preserving collection accessors.

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
collection.toJSON()     -> all items as JSON
collection.keys()       -> list of keys
collection.set(k, v)    -> add/update item
collection.observe(cb)  -> watch for changes
```

No collision possible. `collection('toJSON')` and `collection.toJSON()` are unambiguous.

## The Pattern

```typescript
type Collection<T> = {
	(key: string): ItemHelper<T> | undefined; // Call signature
	toJSON(): Record<string, T>; // Properties
	keys(): string[];
	set(key: string, value: T): void;
	observe(cb: (changes: Map<string, 'add' | 'delete'>) => void): () => void;
};

function createCollection<T>(store: Map<string, T>): Collection<T> {
	// The accessor function
	const accessor = (key: string): ItemHelper<T> | undefined => {
		if (!store.has(key)) return undefined;
		return createItemHelper(store, key);
	};

	// Attach properties using Object.assign
	return Object.assign(accessor, {
		toJSON() {
			return Object.fromEntries(store.entries());
		},
		keys() {
			return Array.from(store.keys());
		},
		set(key: string, value: T) {
			store.set(key, value);
		},
		observe(cb) {
			// ... observation logic
		},
	});
}
```

## Item Helpers

Each item returned by `collection('key')` is itself a helper:

```typescript
type ItemHelper<T> = {
	toJSON(): T; // Get snapshot
	set(value: T): void; // Replace value
	delete(): boolean; // Remove from collection
	observe(cb): () => void;
};
```

## The Complete API Shape

```
collection
├── (key)              -> ItemHelper | undefined
├── .toJSON()          -> Record<string, T>
├── .keys()            -> string[]
├── .set(key, value)   -> void
└── .observe(cb)       -> unsubscribe

collection('posts')    -> ItemHelper
├── .toJSON()          -> T
├── .set(value)        -> void
├── .delete()          -> boolean
└── .observe(cb)       -> unsubscribe
```

## Existence Checks

No `.has()` method needed. Just check if the accessor returns truthy:

```typescript
// Instead of collection.has('posts')
if (collection('posts')) {
	// exists
}

// Or with optional chaining
const data = collection('posts')?.toJSON();
```

## Nesting

The pattern composes naturally for nested structures:

```typescript
definition.tables('posts')?.fields('title')?.toJSON();
//         ^collection      ^collection      ^snapshot
```

## When to Use

Use this pattern when:

- Collection keys are dynamic strings
- You need utility methods that could collide with keys
- You want clear separation between "get item helper" and "get data"
- You need type-safe nested accessors

## When NOT to Use

- Fixed, known keys at compile time (just use a regular object)
- No utility methods needed (just use a Map or object)
- Simple key-value with no per-item operations (just use `.get(key)`)

## Real Example

From the definition helper:

```typescript
// Check if table exists
if (definition.tables('posts')) {
  // Get table as JSON
  const posts = definition.tables('posts')!.toJSON();

  // Get a specific field
  const title = definition.tables('posts')?.fields('title')?.toJSON();

  // Update a field
  definition.tables('posts')?.fields('title')?.set(text({ default: 'Untitled' }));

  // Delete a field
  definition.tables('posts')?.fields('title')?.delete();
}

// Bulk operations
const allTables = definition.tables.toJSON();
const tableNames = definition.tables.keys();
definition.tables.observe((changes) => { ... });
```

## TypeScript Implementation

```typescript
// Type for callable with properties
type CallableCollection<TItem, THelper> = {
	(key: string): THelper | undefined;
	toJSON(): Record<string, TItem>;
	keys(): string[];
	set(key: string, item: TItem): void;
	observe(cb: (changes: Map<string, 'add' | 'delete'>) => void): () => void;
};

// Create using Object.assign
function createCallableCollection<TItem, THelper>(
	getHelper: (key: string) => THelper | undefined,
	methods: {
		toJSON(): Record<string, TItem>;
		keys(): string[];
		set(key: string, item: TItem): void;
		observe(cb: (changes: Map<string, 'add' | 'delete'>) => void): () => void;
	},
): CallableCollection<TItem, THelper> {
	return Object.assign(getHelper, methods);
}
```

## Summary

| Want to...        | Pattern                                                           |
| ----------------- | ----------------------------------------------------------------- |
| Get item helper   | `collection('key')`                                               |
| Check existence   | `if (collection('key'))`                                          |
| Get item snapshot | `collection('key')?.toJSON()`                                     |
| Get all snapshots | `collection.toJSON()`                                             |
| Set item          | `collection.set('key', value)` or `collection('key')?.set(value)` |
| Delete item       | `collection('key')?.delete()`                                     |
| List keys         | `collection.keys()`                                               |
| Observe changes   | `collection.observe(cb)`                                          |
