# YJS Stress Tests

Benchmarks for YJS persistence via Epicenter's table API. Each test measures different performance characteristics under stress.

## Quick Start

```bash
cd examples/stress-test

# Run all benchmarks
bun run run-benchmarks.ts

# Run specific benchmarks (by number or name)
bun run run-benchmarks.ts 1 3 5
bun run run-benchmarks.ts bulk update mixed

# Run with clean slate
bun run run-benchmarks.ts --clean

# List available benchmarks
bun run run-benchmarks.ts --list

# Run individual benchmark directly
bun run stress-test.ts
```

## Benchmarks

| Benchmark | Tests | Key Finding |
|-----------|-------|-------------|
| [Bulk Upsert](./stress-test.md) | `upsertMany` throughput | 19k/s avg, ~152 bytes/item |
| [Write-Delete-Write](./stress-test-write-delete-write.md) | Tombstone overhead | Only 21% overhead for full cycle |
| [Update-Heavy](./stress-test-update-heavy.md) | Repeated updates | Updates ~40% of insert speed |
| [Read-at-Scale](./stress-test-read-at-scale.md) | Query performance | get() O(1), getAll() O(n) |
| [Mixed Workload](./stress-test-mixed-workload.md) | Realistic usage | 210-475 ops/s for single operations |

## Test Details

### 1. Bulk Upsert (`stress-test.ts`)

Tests maximum `upsertMany` throughput across multiple tables.

```bash
bun run stress-test.ts           # Default: 10k items × 10 tables
bun run stress-test.ts 20000     # Custom: 20k items × 10 tables
```

### 2. Write-Delete-Write (`stress-test-write-delete-write.ts`)

Tests file size behavior through create → delete → recreate cycle.

```bash
bun run stress-test-write-delete-write.ts        # Default: 10k items
bun run stress-test-write-delete-write.ts 5000   # Custom count
```

### 3. Update-Heavy (`stress-test-update-heavy.ts`)

Tests performance when repeatedly updating existing rows.

```bash
bun run stress-test-update-heavy.ts           # Default: 5k items, 3 rounds
bun run stress-test-update-heavy.ts 5000 5    # Custom: 5k items, 5 rounds
```

### 4. Read-at-Scale (`stress-test-read-at-scale.ts`)

Tests read performance (`getAll`, `get`, `count`) as document grows.

```bash
bun run stress-test-read-at-scale.ts              # Default: 50k items
bun run stress-test-read-at-scale.ts 100000       # Custom: 100k items
bun run stress-test-read-at-scale.ts 50000 5000   # Measure every 5k items
```

### 5. Mixed Workload (`stress-test-mixed-workload.ts`)

Simulates realistic usage with interleaved reads, writes, updates, and deletes.

```bash
bun run stress-test-mixed-workload.ts         # Default: 5 rounds × 1k ops
bun run stress-test-mixed-workload.ts 10      # Custom: 10 rounds
bun run stress-test-mixed-workload.ts 10 500  # 10 rounds × 500 ops
```

## Key Takeaways

### Always Use Batched Operations

| Method | Speed | Difference |
|--------|-------|------------|
| `upsert()` | ~34/s | 1x |
| `upsertMany()` | ~20,000/s | ~500x faster |

### Recommended Limits

| Document Size | Performance | Recommendation |
|---------------|-------------|----------------|
| < 100k items | Fast | Ideal |
| 100k-300k items | Some slowdown | Acceptable |
| 300k+ items | Significant slowdown | Split into workspaces |

### File Storage

- ~144-174 bytes per item
- Deletions add minimal overhead (~21% for full write-delete-write cycle)
- File size correlates with operation history, not just current data

## Output

All tests save data to `.epicenter/stress.yjs` and report:
- Per-operation timing and rates
- File size progression
- Performance trends and scaling analysis
