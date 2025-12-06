# YJS Stress Tests

Stress tests for YJS persistence, measuring insertion performance, file size growth, and deletion behavior.

## Tests

### 1. Bulk Insertion Test (`stress-test.ts`)

Tests bulk insertion performance across multiple tables.

```bash
cd examples/stress-test

# Default (10k items per table, 100k total)
bun run stress-test.ts

# Custom count
bun run stress-test.ts 20000
```

### 2. Write-Delete-Write Test (`stress-test-write-delete-write.ts`)

Tests how YJS handles a full data lifecycle: create → delete → recreate.

```bash
cd examples/stress-test

# Default (10k items per table per phase)
bun run stress-test-write-delete-write.ts

# Custom count
bun run stress-test-write-delete-write.ts 5000
```

## What These Tests Measure

1. **Bulk insertion performance** with `insertMany`
2. **YJS document size** as data grows
3. **Performance degradation** patterns under load
4. **Deletion behavior** and tombstone overhead

## Key Observations

### insertMany vs insert: ~500x Difference

| Method | Speed | Why |
|--------|-------|-----|
| `insert()` | ~34/s | Each call = separate YJS transaction |
| `insertMany()` | ~20,000/s | Single YJS transaction for all rows |

Always use `insertMany({ rows: [...] })` for bulk operations. It uses `$transact` internally to batch all changes into one YJS update.

### Performance Degradation at Scale

YJS document size affects write performance. From a 1M item test:

| Items in Doc | Speed | File Size |
|--------------|-------|-----------|
| 100k | 7.4k/s | ~10 MB |
| 200k | 3.0k/s | ~20 MB |
| 300k | 1.5k/s | ~30 MB |
| 400k | 1.1k/s | ~40 MB |
| 500k+ | <700/s | 50+ MB |

The slowdown is expected - larger YJS documents mean more work per transaction.

### Recommended Limits

- **< 100k items per workspace**: Fast, no noticeable degradation
- **100k-300k items**: Acceptable with some slowdown
- **300k+ items**: Consider splitting into multiple workspaces

For very large datasets, use separate workspaces to keep each YJS document smaller.

### Write-Delete-Write: Efficient Tombstone Handling

From a test with 100k items (10k per table × 10 tables):

| Phase | File Size | Notes |
|-------|-----------|-------|
| After Write (100k items) | 14.39 MB | ~144 bytes/item |
| After Delete (0 items) | 2.58 MB | 82% reduction |
| After Write Again (100k items) | 17.35 MB | ~174 bytes/item |

**Key findings:**

1. **File shrinks after deletion**: The YJS file reduced by 82% after deleting all items, contrary to the expectation that CRDT tombstones would grow the file.

2. **Minimal overhead for full cycle**: Final size (17.35 MB) is only 21% larger than initial write (14.39 MB). This 1.21x ratio means YJS efficiently stores the complete operation history.

3. **Delete is slower than insert**: Deletion ran at ~9-18k items/sec vs insertion at ~10-62k items/sec.

4. **Second write is slower**: Phase 3 averaged ~8-20k/s vs Phase 1's ~10-62k/s, likely due to YJS managing more internal structures.

**Interpretation**: YJS handles write-delete-write cycles efficiently. Even with full tombstone history, you're paying only ~21% storage overhead. This makes it viable for applications where data is frequently deleted and recreated.

## Output

The test reports:
- Per-table insertion time and rate
- Total time and average rate
- Final `.yjs` file size
- Bytes per item (storage efficiency)

Files are saved to `.epicenter/stress.yjs`.
