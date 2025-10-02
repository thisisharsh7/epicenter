# When Y.Map's Single Generic is a Design Smell

## If you know the keys at compile time, you don't really need a Y.Map, you can use a plain object

I was building a YJS-based data structure and hit this weird typing error. Had a nested map where I knew exactly what keys existed: `rowsById` (a map of maps) and `rowOrder` (an array of strings). Seemed perfect for a Y.Map, right?

Wrong.

## The Problem

Y.Map only accepts one generic parameter:

```typescript
type Y.Map<T> = // ... can only specify value type
```

When you have heterogeneous values (different types for different keys), you end up fighting the type system:

```typescript
// This doesn't work cleanly
const tableMap = new Y.Map<Y.Map<YjsValue> | Y.Array<string>>();
tableMap.set('rowsById', new Y.Map());    // type: Y.Map<YjsValue>
tableMap.set('rowOrder', new Y.Array());  // type: Y.Array<string>

// TypeScript can't verify which key has which type
const rowsById = tableMap.get('rowsById'); // Y.Map<YjsValue> | Y.Array<string>
```

You need type assertions everywhere. Messy.

## The Insight

Here's what took me too long to realize: if you know the keys at compile time, you probably don't need a Y.Map.

Y.Map is designed for dynamic keys where you don't know what keys will exist. It tracks additions and deletions of keys. But I had exactly two keys, both always present, both known at compile time: `rowsById` and `rowOrder`.

That's not a dynamic key-value store. That's a struct.

## The Solution

Use a plain object:

```typescript
// Before: Y.Map with heterogeneous values
const tableMap = new Y.Map();
tableMap.set('rowsById', new Y.Map<Y.Map<YjsValue>>());
tableMap.set('rowOrder', new Y.Array<string>());

// After: Plain object with Y.Map values
type TableStructure = {
  rowsById: Y.Map<Y.Map<YjsValue>>;
  rowOrder: Y.Array<string>;
};

const table: TableStructure = {
  rowsById: new Y.Map<Y.Map<YjsValue>>(),
  rowOrder: new Y.Array<string>(),
};
```

Now TypeScript knows exactly what's at each key:

```typescript
const rowsById = table.rowsById;  // Y.Map<Y.Map<YjsValue>>
const rowOrder = table.rowOrder;  // Y.Array<string>
```

No type assertions. No union types. Just clean, type-safe access.

## When to Use Each

**Use Y.Map when:**
- Keys are dynamic (user-generated, runtime-determined)
- You need to track key additions/deletions collaboratively
- Different clients might add different keys

**Use plain objects when:**
- Keys are fixed and known at compile time
- Structure is defined by your schema
- You need heterogeneous value types with type safety

## The Real Structure

Here's what the vault structure looks like now:

```typescript
ydoc
  └─ tables (Y.Map<TableStructure>)
      └─ tableName → { rowsById: Y.Map<...>, rowOrder: Y.Array<...> }
```

The outer `tables` map has dynamic keys (table names). That's a Y.Map.

The inner structure has fixed keys (`rowsById`, `rowOrder`). That's a plain object.

## The Lesson

Y.Map's single generic parameter isn't a limitation. It's a signal. If you're fighting with heterogeneous types, ask: do I actually need collaborative tracking for these specific keys?

Most of the time, the answer is no. Use a plain object. Lighter weight, better types, clearer intent.
