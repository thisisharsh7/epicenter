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

From a 100k item test (10k items × 10 tables):

| Table # | Speed | Cumulative Items |
|---------|-------|------------------|
| 1 | 64.4k/s | 10k |
| 2 | 48.2k/s | 20k |
| 3 | 35.1k/s | 30k |
| 5 | 23.9k/s | 50k |
| 7 | 16.6k/s | 70k |
| 10 | 11.5k/s | 100k |

Final stats:
- **Total time**: 5.27s for 100k items
- **Average rate**: 19.0k/s
- **File size**: 14.53 MB (~152 bytes per item)

### Performance Trend

Speed decreases as document grows:
- First 10k items: 64.4k/s
- Last 10k items: 11.5k/s
- ~5.6x slowdown across the run

### Recommended Limits

- **< 100k items per workspace**: Fast, acceptable degradation
- **100k-300k items**: Noticeable slowdown but workable
- **300k+ items**: Consider splitting into multiple workspaces

## Interpretation

The slowdown is expected; larger YJS documents mean more work per transaction. The ~152 bytes per item is efficient for structured data. For very large datasets, use separate workspaces to keep each YJS document smaller.
