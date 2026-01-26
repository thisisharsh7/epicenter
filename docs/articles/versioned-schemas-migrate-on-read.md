# Versioned Schemas with Migrate-on-Read

Most developers struggle with migrations in local-first apps. The core issue: how do you rename columns, change field types, or restructure data when that data is replicated across many clients with different app versions?

Epicenter solves this with a pattern we call **migrate-on-read**: store data in its original schema version, validate and migrate when reading.

## The Problem with Traditional Migrations

In a traditional database, migrations are applied once to all data:

```sql
ALTER TABLE posts ADD COLUMN views INTEGER DEFAULT 0;
```

Every row gets the new column. Done.

But in a local-first app:
- Data lives on many devices
- Devices might be offline for weeks
- Old app versions might still be writing data
- You can't run a migration "on the database" because there are thousands of databases

Running migrations on sync is fragile. What if the migration fails halfway? What if two clients sync different versions simultaneously?

## Migrate-on-Read

Instead of migrating data in place, Epicenter migrates when you read:

```typescript
// Storage contains original data:
{ id: "row-1", title: "Hello", _v: "1" }  // v1 schema (no views field)

// When you read:
const post = tables.posts.get("row-1");
// → { id: "row-1", title: "Hello", views: 0, _v: "3" }  // Migrated to v3
```

The migration function transforms old data to the latest schema on-the-fly. The original data stays untouched in storage.

**Key benefits:**
- No migrations to run
- Old and new clients can coexist
- Data is always valid when you use it
- Failed migrations don't corrupt storage

## Defining Versioned Schemas

You define schemas with `.version()` and provide a migration function with `.migrate()`:

```typescript
const posts = defineTable('posts')
  // V1: Original schema
  .version(type({
    id: 'string',
    title: 'string',
    _v: '"1"'
  }))
  // V2: Added views counter
  .version(type({
    id: 'string',
    title: 'string',
    views: 'number',
    _v: '"2"'
  }))
  // V3: Added tags
  .version(type({
    id: 'string',
    title: 'string',
    views: 'number',
    tags: 'string[]',
    _v: '"3"'
  }))
  .migrate((row) => {
    // row is V1 | V2 | V3, must return V3
    switch (row._v) {
      case '1':
        return { ...row, views: 0, tags: [], _v: '3' as const };
      case '2':
        return { ...row, tags: [], _v: '3' as const };
      case '3':
        return row;
    }
  });
```

## How Validation Works

Internally, Epicenter creates a union of all your schemas:

```typescript
// Conceptually:
const unionSchema = schema1 | schema2 | schema3;
```

When you read data:
1. Validate against the union (any version is valid)
2. Run the migration function to normalize to latest
3. Return strongly-typed latest version

This uses Standard Schema, so you can use any validation library: ArkType, Zod, TypeBox, Valibot.

## The Discriminator Pattern

While not required, we **highly recommend** including a version field in your schemas:

```typescript
// Recommended: Explicit version field
.version(type({ id: 'string', title: 'string', _v: '"1"' }))
.version(type({ id: 'string', title: 'string', views: 'number', _v: '"2"' }))
```

This makes migrations trivial:

```typescript
.migrate((row) => {
  switch (row._v) {
    case '1': return { ...row, views: 0, _v: '2' as const };
    case '2': return row;
  }
})
```

Without a discriminator, you have to check for field presence, which is fragile:

```typescript
// Works but not recommended
.migrate((row) => {
  if (!('views' in row)) return { ...row, views: 0 };
  return row;
})
```

## KV Storage

The same pattern works for key-value storage:

```typescript
const theme = defineKV('theme')
  .version(type({ mode: "'light' | 'dark'", _v: '"1"' }))
  .version(type({ mode: "'light' | 'dark' | 'system'", fontSize: 'number', _v: '"2"' }))
  .migrate((v) => {
    if (v._v === '1') return { ...v, fontSize: 14, _v: '2' as const };
    return v;
  });

// Usage
kv.theme.set({ mode: 'dark', fontSize: 16, _v: '2' });
const theme = kv.theme.get();  // Always returns v2 shape
```

## Reads Are Pure

An important design decision: **reads don't write back migrated data**.

When you read a v1 row and get a v3 result, the storage still contains v1. We don't automatically persist the migration because:

- Reads causing writes is unexpected
- It would increase sync traffic
- It could cause conflicts if multiple clients read simultaneously

If you want to persist migrated data, do it explicitly:

```typescript
const result = tables.posts.get('post-1');
if (result.status === 'valid') {
  tables.posts.upsert(result.row);  // Explicitly write back
}
```

## Storage: YKeyValue for Bounded Memory

Both tables and KV use YKeyValue (not Y.Map) for storage. Benchmarks show Y.Map has unbounded memory growth with frequent updates:

| Updates/Key | Y.Map | YKeyValue |
|-------------|-------|-----------|
| 10 | 562 B | 241 B |
| 100 | 4.43 KB | 254 B |
| 1000 | 44 KB | 259 B |

YKeyValue uses an append-and-cleanup pattern that keeps memory bounded regardless of update frequency.

## When to Use This Pattern

**Good fit:**
- Apps with evolving schemas (most apps)
- Document-style data edited by one user at a time
- Apps where data integrity matters more than concurrent field editing

**Consider alternatives if:**
- You need concurrent editing of individual fields
- Your schema is completely stable
- You're building a highly collaborative real-time editor

## Summary

1. Define schemas with `.version()` for each schema evolution
2. Provide a `.migrate()` function that normalizes any version to latest
3. Use a `_v` discriminator field (recommended) for clean migrations
4. Data is validated and migrated on read, not in storage
5. Both tables and KV use the same pattern

This approach eliminates "CRDT migration hell" by embracing row-level atomicity and lazy migration. Your app always sees the latest schema shape, regardless of when the underlying data was written.
