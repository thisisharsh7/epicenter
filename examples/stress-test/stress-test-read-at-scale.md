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

## Expected Findings

_Run the benchmark to populate this section with actual results._

Typical patterns to look for:

### getAll()
- Should scale linearly O(n) with document size
- At 50k items, expect 50-200ms depending on item complexity

### get()
- Should be roughly constant time O(1) due to Map-based lookup
- YJS uses Y.Map internally, so key lookups should be fast
- Slight degradation possible due to YJS internal structures

### count()
- Should be very fast, likely O(1)
- YJS Map tracks size internally

## Interpretation

This benchmark helps determine:

- When to paginate `getAll()` calls
- Whether single-row lookups are viable at scale
- If you need to cache counts or can call `count()` frequently

For applications with large datasets:
- Consider limiting `getAll()` to subsets using `filter()`
- Rely on single-row `get()` for most operations
- Use `count()` freely; it's typically very fast
