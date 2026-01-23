# The Callable Collection Pattern in TypeScript

A pattern for type-safe collection APIs that avoids namespace collisions.

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
tables.toJSON()     -> all items as JSON
tables.keys()       -> list of keys
```

**No collision possible.** `tables('toJSON')` and `tables.toJSON()` are syntactically distinct.

## The Pattern

```
collection
├── (key)              -> ItemHelper | undefined    [call]
├── .toJSON()          -> Record<string, T>         [property]
├── .keys()            -> string[]                  [property]
├── .set(key, value)   -> void                      [property]
└── .observe(cb)       -> unsubscribe               [property]

collection('posts')    -> ItemHelper
├── .toJSON()          -> T
├── .set(value)        -> void
├── .delete()          -> boolean
└── .observe(cb)       -> unsubscribe
```

## Implementation

TypeScript supports callable objects via call signatures in type definitions:

```typescript
type Collection<T> = {
	// Call signature: makes the object callable
	(key: string): ItemHelper<T> | undefined;

	// Properties: utilities on the collection
	toJSON(): Record<string, T>;
	keys(): string[];
	set(key: string, value: T): void;
	observe(callback: () => void): () => void;
};
```

Create it using `Object.assign`:

```typescript
function createCollection<T>(store: Map<string, T>): Collection<T> {
	// The accessor function
	const accessor = (key: string): ItemHelper<T> | undefined => {
		if (!store.has(key)) return undefined;
		return createItemHelper(store, key);
	};

	// Attach properties
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
		observe(callback) {
			// ... observation logic
			return () => {
				/* unsubscribe */
			};
		},
	});
}
```

## Key Design Decisions

### No `.get()` Method

Instead of `collection.get('posts')`, use `collection('posts')?.toJSON()`.

Why? Two reasons:

1. **Consistency**: The call always returns a helper, `.toJSON()` always returns data
2. **Clarity**: No confusion between "get helper" vs "get snapshot"

### No `.has()` Method

Instead of `collection.has('posts')`, use `if (collection('posts'))`.

The accessor returns `undefined` for missing items. Checking existence is just checking truthiness.

```typescript
// Check existence
if (collection('posts')) {
	// exists
}

// Get with existence check
const posts = collection('posts');
if (posts) {
	console.log(posts.toJSON());
}

// Or with optional chaining
const data = collection('posts')?.toJSON();
```

### Item Helpers Return Undefined When Missing

```typescript
const posts = tables('posts'); // undefined if "posts" doesn't exist
```

This is intentional. It forces explicit handling of missing items and avoids "phantom" helpers that don't correspond to real data.

## Nesting

The pattern composes naturally:

```typescript
definition
├── .tables(name)                   -> TableHelper | undefined
│   ├── .fields(name)               -> FieldHelper | undefined
│   │   ├── .toJSON()               -> FieldSchema
│   │   └── .set(schema)            -> void
│   └── .metadata
│       ├── .toJSON()               -> { name, icon, description }
│       └── .set({ name?, ... })    -> void
└── .kv(name)                       -> KvHelper | undefined
```

Usage:

```typescript
// Deep access with optional chaining
const titleSchema = definition.tables('posts')?.fields('title')?.toJSON();

// Modify nested item
definition
	.tables('posts')
	?.fields('title')
	?.set(text({ default: 'Untitled' }));

// Delete nested item
definition.tables('posts')?.fields('title')?.delete();
```

## The Complete API

| Want to...                  | Pattern                          |
| --------------------------- | -------------------------------- |
| Check if exists             | `if (collection('key'))`         |
| Get item helper             | `collection('key')`              |
| Get item snapshot           | `collection('key')?.toJSON()`    |
| Get all snapshots           | `collection.toJSON()`            |
| Set item (collection level) | `collection.set('key', value)`   |
| Set item (helper level)     | `collection('key')?.set(value)`  |
| Delete item                 | `collection('key')?.delete()`    |
| List keys                   | `collection.keys()`              |
| Observe collection          | `collection.observe(cb)`         |
| Observe item                | `collection('key')?.observe(cb)` |

## When to Use

**Good fit:**

- Dynamic string keys not known at compile time
- Need utility methods that could collide with keys
- Want clear separation between helpers and data
- Building nested/hierarchical accessors

**Not needed:**

- Fixed, known keys (use regular object)
- No utility methods (use Map)
- Simple get/set without per-item operations (use `.get(key)`)

## Why Not Proxies?

Proxies can achieve similar results but have drawbacks:

1. **TypeScript pain**: Typing proxies correctly is complex
2. **Debugging**: Proxy behavior is harder to trace
3. **Performance**: Proxies have overhead (though usually negligible)
4. **Explicitness**: Function calls are more explicit than property access

The callable pattern is simpler, explicit, and has excellent TypeScript support.

## Summary

The Callable Collection Pattern solves namespace collisions by making collections callable:

- **Call** `collection('key')` to get an item helper
- **Access properties** `collection.toJSON()` for utilities
- No collision, no prefixes, no proxies
- Excellent TypeScript inference
- Natural composition for nested structures
