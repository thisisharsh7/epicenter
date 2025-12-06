# Write-Delete-Write Benchmark

Tests YJS file size behavior through a complete data lifecycle: create → delete → recreate.

## What It Tests

- How YJS handles tombstones from deletions
- Whether file size grows unboundedly with delete operations
- Performance characteristics across the full lifecycle

## Key Findings

From a test with 100k items (10k per table × 10 tables):

| Phase | File Size | Notes |
|-------|-----------|-------|
| After Write (100k items) | 14.39 MB | ~144 bytes/item |
| After Delete (0 items) | 2.58 MB | 82% reduction |
| After Write Again (100k items) | 17.35 MB | ~174 bytes/item |

### Surprising Results

1. **File shrinks after deletion**: The YJS file reduced by 82% after deleting all items, contrary to the expectation that CRDT tombstones would grow the file.

2. **Minimal overhead for full cycle**: Final size (17.35 MB) is only 21% larger than initial write (14.39 MB). This 1.21x ratio means YJS efficiently stores the complete operation history.

3. **Delete is slower than upsert**: Deletion ran at ~9-18k items/sec vs upsert at ~10-62k items/sec.

4. **Second write is slower**: Phase 3 averaged ~8-20k/s vs Phase 1's ~10-62k/s, likely due to YJS managing more internal structures.

## Interpretation

YJS handles write-delete-write cycles efficiently. Even with full tombstone history, you're paying only ~21% storage overhead. This makes it viable for applications where data is frequently deleted and recreated.

The file shrinkage after deletion is particularly interesting; it suggests YJS may be doing some form of compaction or the deleted entries don't add as much overhead as expected.
