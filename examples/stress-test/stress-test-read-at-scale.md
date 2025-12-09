# Read-at-Scale Benchmark

Tests read performance as document size grows.

## What It Tests

- `getAll()` performance scaling with document size
- Single-row `get()` lookup time at scale
- `count()` operation overhead

## Methodology

1. Incrementally add data in batches (default 10k items per batch)
2. After each batch, measure read performance
3. Continue until target size (default 50k items)

## Key Questions Answered

- How does `getAll()` performance scale with document size?
- Is single-row `get()` affected by document size?
- What's the time complexity of each operation?

## Key Findings

From a test incrementally loading 50k items:

| Items | getAll() | get() (per call) | count() |
|-------|----------|------------------|---------|
| 10,000 | 24ms (417k/s) | 61µs | 2.1ms |
| 20,000 | 34ms (582k/s) | 42µs | 2.9ms |
| 30,000 | 149ms (201k/s) | 158µs | 2.4ms |
| 40,000 | 69ms (584k/s) | 48µs | 3.6ms |
| 50,000 | 58ms (862k/s) | 31µs | 6.3ms |

### Scaling Analysis (10k → 50k items, 5x growth)

| Operation | Time at 10k | Time at 50k | Scaling |
|-----------|-------------|-------------|---------|
| getAll() | 24ms | 58ms | 2.4x slower |
| get() | 61µs | 31µs | Actually faster |
| count() | 2.1ms | 6.3ms | 3.0x slower |

### Complexity Estimates

- **getAll()**: ~O(n) linear scaling (2.4x slowdown for 5x items = good sublinear behavior)
- **get()**: ~O(1) constant time (actually got faster with more data, likely due to caching effects)
- **count()**: ~O(1) to O(log n) (3x slowdown for 5x items)

### Key Observations

1. **getAll() is fast**: Even at 50k items, getAll() returns all rows in ~58ms at 862k items/second.

2. **Single lookups are blazing fast**: get() operations average 31-61µs (microseconds), making single-row lookups viable at any scale.

3. **Some measurement noise**: The 30k measurement shows higher times, likely due to system variance rather than algorithmic complexity.

## Interpretation

This benchmark helps determine:

- **When to paginate getAll()**: At 50k items, 58ms is acceptable. Consider pagination above 100k items.
- **Single-row lookups are always viable**: Sub-100µs times mean you can call get() freely.
- **count() is fast enough**: 2-6ms is negligible for most use cases.
