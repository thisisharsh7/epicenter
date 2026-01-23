# The Callable Collection Insight

> **Status**: Epicenter has **migrated away** from the callable pattern to explicit `.get()` methods. This article explains the pattern and why we chose not to use it.

The callable collection pattern boils down to a simple insight.

**Instead of:**

```typescript
const posts = workspace.tables.get('posts');
```

**You can do:**

```typescript
const posts = workspace.tables('posts');
```

That's it. The "magic" is just lifting `.get()` to be the call signature itself. The function IS the getter.

## Implementation

```typescript
const accessor = (key: string) => store.get(key);

return Object.assign(accessor, {
  get: (key) => ...,    // Still available if you want it
  has: (key) => ...,
  keys: () => ...,
  // ... other utilities
});
```

## Why Bother?

The primary win is ergonomics: `tables('posts')` feels more natural than `tables.get('posts')` when you're doing it frequently.

The namespace collision rationale (what if someone names a table "toJSON"?) is real but secondary. You get that benefit for free, but it's not the main reason to use the pattern.

## Our Recommendation: Prefer `.get()`

After consideration, we prefer `.get()` over the callable pattern for most cases:

1. **Explicit over clever**: `tables.get('posts')` immediately tells you what's happening. `tables('posts')` requires knowing the API convention.

2. **Familiar**: Map, WeakMap, every ORM, every cache library—they all use `.get()`. It's the established pattern.

3. **Discoverable**: When you type `tables.` your IDE shows you all the methods. The callable pattern hides the "main" operation in the call signature.

4. **Consistency**: If you have `.set()`, `.has()`, `.delete()`, then `.get()` completes the set. Having the getter be callable while everything else is a method is asymmetric.

The callable pattern is a premature optimization for ergonomics. It saves 4 characters but adds cognitive load. The namespace collision benefit is real but solves a problem that almost never happens in practice.

**Use `.get()` by default.** Only consider callable if verbosity becomes a genuine pain point—which it probably won't.

## Epicenter's Current API

After this analysis, we migrated all Epicenter APIs to use explicit `.get()`:

```typescript
// Tables
tables.get('posts').upsert({ id: '1', title: 'Hello' });
tables.get('posts').getAll();

// KV (flattened - no intermediate helper)
kv.get('theme'); // returns value directly
kv.set('theme', 'dark'); // set directly
kv.reset('theme'); // reset to default

// Definition helpers
definition.tables.get('posts')?.fields.get('title');
definition.kv.get('theme')?.setName('Color Theme');
```

## See Also

- [Callable Collection Pattern](./callable-collection-pattern.md): The full pattern with nested structures, helpers, and observation
