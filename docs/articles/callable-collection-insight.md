# The Callable Collection Insight

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

## When to Use

Use this pattern when:

- You have a collection that's accessed frequently
- `.get()` feels clunky for the API you're designing
- You want the cleaner `collection('key')` syntax

Don't overcomplicate it. It's syntactic sugar via `Object.assign`.

## See Also

- [Callable Collection Pattern](./callable-collection-pattern.md): The full pattern with nested structures, helpers, and observation
