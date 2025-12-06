# YJS Stress Test

Stress tests YJS persistence with bulk insertions across multiple tables.

## Running

```bash
cd examples/stress-test

# Default (20k items per table, 200k total) - ~1-2 minutes
bun test

# Quick test (10k per table, 100k total) - ~10 seconds
bun test 10000

# Full stress test (100k per table, 1M total) - 10+ minutes, expect slowdown
bun test 100000
```

## What This Tests

1. **Bulk insertion performance** with `insertMany`
2. **YJS document size** as data grows
3. **Performance degradation** patterns under load

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

## Output

The test reports:
- Per-table insertion time and rate
- Total time and average rate
- Final `.yjs` file size
- Bytes per item (storage efficiency)

Files are saved to `.epicenter/stress.yjs`.
