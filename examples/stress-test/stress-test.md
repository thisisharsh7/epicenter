# Bulk Upsert Benchmark

Tests raw `upsertMany` throughput across multiple tables with large datasets.

## What It Tests

- Maximum upsert throughput using batched operations
- File size growth patterns as data accumulates
- Performance degradation as document grows

## Key Findings

### upsertMany vs upsert: ~500x Difference

| Method | Speed | Why |
|--------|-------|-----|
| `upsert()` | ~34/s | Each call = separate YJS transaction |
| `upsertMany()` | ~20,000/s | Single YJS transaction for all rows |

Always use `upsertMany({ rows: [...] })` for bulk operations.

### Performance Degradation at Scale

From a 1M item test:

| Items in Doc | Speed | File Size |
|--------------|-------|-----------|
| 100k | 7.4k/s | ~10 MB |
| 200k | 3.0k/s | ~20 MB |
| 300k | 1.5k/s | ~30 MB |
| 400k | 1.1k/s | ~40 MB |
| 500k+ | <700/s | 50+ MB |

### Recommended Limits

- **< 100k items per workspace**: Fast, no noticeable degradation
- **100k-300k items**: Acceptable with some slowdown
- **300k+ items**: Consider splitting into multiple workspaces

## Interpretation

The slowdown is expected; larger YJS documents mean more work per transaction. For very large datasets, use separate workspaces to keep each YJS document smaller.
