# Mixed Workload Benchmark

Simulates realistic application usage with interleaved reads and writes.

## What It Tests

- Performance with mixed operation types
- Overhead from operation switching
- Realistic usage pattern behavior

## Methodology

Runs multiple rounds of mixed operations with configurable distribution:

| Operation | Default % | Description |
|-----------|-----------|-------------|
| Upsert (new) | 30% | Create new items |
| Upsert (update) | 30% | Update existing items |
| Delete | 10% | Remove items |
| Read (getAll) | 10% | Fetch all items |
| Read (get) | 20% | Fetch single item |

Default: 5 rounds × 1,000 operations = 5,000 total operations

## Key Questions Answered

- Does interleaving reads/writes affect performance?
- Is there overhead from operation switching?
- How does the system handle realistic usage patterns?

## Key Findings

From a test with 5 rounds × 1,000 operations (5,000 total):

| Round | Ops/sec | Items | File Size |
|-------|---------|-------|-----------|
| 1 | 475/s | 1,187 | 191 KB |
| 2 | 438/s | 1,372 | 233 KB |
| 3 | 288/s | 1,589 | 279 KB |
| 4 | 238/s | 1,810 | 324 KB |
| 5 | 210/s | 2,026 | 368 KB |

### Performance Trends

- **55.8% slowdown over 5 rounds**: First round ran at 475 ops/s, last round at 210 ops/s
- **Item count grew ~2x**: From 1,000 seed items to 2,026 final items
- **File grew ~2x**: From 191 KB to 368 KB

### Average Time per Operation Type

| Operation | Avg Time | Total Count |
|-----------|----------|-------------|
| upsert (new) | 4ms | 1,536 |
| upsert (update) | 4ms | 1,490 |
| delete | 4ms | 510 |
| readAll | 3ms | 491 |
| readSingle | <1ms | 973 |

### Key Observations

1. **Single-item operations dominate**: Each upsert/update/delete takes ~4ms due to individual YJS transactions (vs batched operations).

2. **Read operations are cheap**: readAll() at 3ms and get() at <1ms don't add much overhead.

3. **Consistent degradation**: The ~56% slowdown is predictable and correlates with document growth.

## Interpretation

This benchmark answers: "What throughput can I expect in a real application?"

**210-475 ops/second** is the expected range for mixed single-item operations. For higher throughput:
- Batch writes using `upsertMany()` and `deleteMany()`
- Use `get()` instead of `getAll()` when you only need specific items
- The ~4ms per single write operation is the cost of individual YJS transactions
