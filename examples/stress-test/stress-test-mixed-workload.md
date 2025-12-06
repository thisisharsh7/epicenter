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

## Expected Findings

_Run the benchmark to populate this section with actual results._

Typical patterns to look for:

### Operation Throughput
- Mixed workload typically slower than pure write tests
- `getAll()` operations can dominate time budget
- Single operations (`upsert`, `get`, `delete`) are fast

### Performance Trends
- Slight degradation expected as item count grows
- `getAll()` slowdown most noticeable over rounds
- Write operations should remain relatively stable

### Operation Costs
Expected average times (will vary by hardware):
- `upsert()` single: ~0.1-0.5ms
- `get()` single: ~0.01-0.1ms
- `delete()` single: ~0.1-0.5ms
- `getAll()`: scales with item count

## Interpretation

This benchmark answers: "What throughput can I expect in a real application?"

Unlike pure write tests, mixed workloads:
- Include read operations that don't add data
- Exercise the full API surface
- Show realistic degradation patterns

For application planning:
- Use these numbers to estimate if your workload fits
- If `getAll()` dominates, consider using `filter()` or pagination
- Single-item operations are cheap; use them liberally
