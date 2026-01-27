# TinyBase MergeableStore vs Yjs Performance

I was comparing TinyBase and Yjs to understand the performance tradeoffs. I like TinyBase for its cell-level last-write-wins semantics—when two clients edit different cells in the same row, both changes survive. That's powerful for structured data where Yjs's character-level CRDT feels like overkill.

But I wanted to compare TinyBase's MergeableStore performance against raw Yjs. Here's what I found.

**Note:** TinyBase also has a regular `Store` which is just a wrapper around plain JavaScript objects—no CRDT, no conflict resolution. That's obviously more efficient than Yjs, but it's not a fair comparison. The fair comparison is `MergeableStore` vs Yjs since both provide CRDT capabilities with automatic conflict resolution.

## The Quick Takeaways

1. **Yjs is faster** at writes (~2x) and sync (~4x) than TinyBase MergeableStore

2. **Yjs is more compact** in storage (~2x smaller) thanks to binary encoding

3. **TinyBase MergeableStore uses less memory** for the same data (~2.8x less heap usage)

4. **TinyBase's cell-level LWW is semantically different** from Yjs's operation-based merging—pick based on your conflict resolution needs, not just performance

## Benchmark Results

### Write Performance

| Operation | Yjs | TinyBase MergeableStore | Winner |
|-----------|-----|-------------------------|--------|
| Single row write | 0.010 ms | 0.022 ms | Yjs (2.2x) |
| Batch write (1000 rows) | 1.05 ms | 1.67 ms | Yjs (1.6x) |

Yjs wins on write speed. The Y.Map structure is highly optimized in V8.

### Synchronization

| Operation | Yjs | TinyBase MergeableStore | Winner |
|-----------|-----|-------------------------|--------|
| One-way sync (100 rows) | 0.23 ms | 1.02 ms | Yjs (4.4x) |
| Bidirectional with conflict | 0.036 ms | 0.076 ms | Yjs (2.1x) |

Yjs's binary delta encoding crushes TinyBase's JSON-based sync. This is where you really feel the difference.

### Storage Size (5000 rows, 2 fields each)

| Format | Size | vs Yjs |
|--------|------|--------|
| Yjs (binary) | 492 KB | — |
| TinyBase MergeableStore (JSON) | 919 KB | 1.9x larger |

MergeableStore stores HLC timestamps as strings for every cell. Yjs encodes the same information more cleverly in binary.

### Memory Usage (10 docs × 10k rows)

| Library | Heap Usage |
|---------|------------|
| Yjs | 51.7 MB |
| TinyBase MergeableStore | 18.2 MB |

Interestingly, TinyBase uses less runtime memory despite larger serialized size. Yjs maintains more internal structures (item structs, state vectors, delete sets).

## Why MergeableStore Is Larger on Disk

MergeableStore adds Hybrid Logical Clock (HLC) timestamps to every cell:

```typescript
// What MergeableStore actually stores
{
  pets: {
    fido: {
      species: ['dog', 'client1-1704067200-0'],
      color: ['brown', 'client1-1704067200-1']
    }
  }
}
```

Every cell carries its timestamp as a string. For a table with 5000 rows × 2 cells, that's 10,000 timestamps. Yjs packs similar metadata into a more efficient binary format.

## The Minimal Reproduction

```typescript
/**
 * TinyBase MergeableStore vs Yjs Benchmark
 * Run with: bun run benchmark.ts
 * Dependencies: bun add tinybase yjs
 */
import * as Y from 'yjs';
import { createMergeableStore } from 'tinybase';

function benchmark(name: string, fn: () => void, iterations = 1000): number {
  for (let i = 0; i < 10; i++) fn(); // warmup
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  return (performance.now() - start) / iterations;
}

// Single writes
const yjsSingle = benchmark('yjs', () => {
  const doc = new Y.Doc();
  const table = doc.getMap('pets');
  const row = new Y.Map();
  row.set('species', 'dog');
  row.set('color', 'brown');
  table.set('fido', row);
});

const tbSingle = benchmark('tinybase', () => {
  const store = createMergeableStore();
  store.setRow('pets', 'fido', { species: 'dog', color: 'brown' });
});

console.log(`Single write: Yjs ${yjsSingle.toFixed(4)}ms, TinyBase ${tbSingle.toFixed(4)}ms`);

// Storage size comparison
const rowCount = 5000;

const yjsDoc = new Y.Doc();
const yjsTable = yjsDoc.getMap('users');
yjsDoc.transact(() => {
  for (let i = 0; i < rowCount; i++) {
    const row = new Y.Map();
    row.set('name', `User ${i}`);
    row.set('email', `user${i}@example.com`);
    yjsTable.set(`user-${i}`, row);
  }
});
const yjsSize = Y.encodeStateAsUpdate(yjsDoc).byteLength;

const mergeable = createMergeableStore();
mergeable.transaction(() => {
  for (let i = 0; i < rowCount; i++) {
    mergeable.setRow('users', `user-${i}`, {
      name: `User ${i}`,
      email: `user${i}@example.com`,
    });
  }
});
const mergeableSize = new TextEncoder().encode(
  JSON.stringify(mergeable.getMergeableContent())
).byteLength;

console.log(`\nStorage (${rowCount} rows):`);
console.log(`  Yjs binary:              ${(yjsSize / 1024).toFixed(1)} KB`);
console.log(`  TinyBase MergeableStore: ${(mergeableSize / 1024).toFixed(1)} KB`);

// Sync comparison
const syncYjs = benchmark('yjs sync', () => {
  const doc1 = new Y.Doc();
  const doc2 = new Y.Doc();
  const table1 = doc1.getMap('users');
  doc1.transact(() => {
    for (let i = 0; i < 100; i++) {
      const row = new Y.Map();
      row.set('name', `User ${i}`);
      table1.set(`user-${i}`, row);
    }
  });
  const update = Y.encodeStateAsUpdate(doc1);
  Y.applyUpdate(doc2, update);
}, 100);

const syncTb = benchmark('tinybase sync', () => {
  const store1 = createMergeableStore();
  const store2 = createMergeableStore();
  store1.transaction(() => {
    for (let i = 0; i < 100; i++) {
      store1.setRow('users', `user-${i}`, { name: `User ${i}` });
    }
  });
  const content = store1.getMergeableContent();
  store2.applyMergeableChanges(content);
}, 100);

console.log(`\nSync (100 rows):`);
console.log(`  Yjs:      ${syncYjs.toFixed(4)} ms`);
console.log(`  TinyBase: ${syncTb.toFixed(4)} ms`);
```

## Sample Output

```
Single write: Yjs 0.0099ms, TinyBase 0.0219ms

Storage (5000 rows):
  Yjs binary:              492.5 KB
  TinyBase MergeableStore: 919.4 KB

Sync (100 rows):
  Yjs:      0.2321 ms
  TinyBase: 1.0160 ms
```

## When to Use Which

**Use TinyBase MergeableStore when:**
- You need cell-level last-write-wins semantics specifically
- The relational API (tables, rows, cells, queries, indexes) is valuable
- Memory efficiency at runtime matters more than storage/sync size
- You're okay with JSON-based sync payloads

**Use raw Yjs when:**
- Sync performance and payload size are critical
- You need collaborative text editing (Y.Text)
- You want the most battle-tested CRDT library
- You're building for bandwidth-constrained environments

The lesson: Yjs is more efficient for sync and storage, but TinyBase MergeableStore offers a different conflict resolution model (cell-level LWW vs operation-based) that might be exactly what you need for structured data. Choose based on semantics first, performance second.
