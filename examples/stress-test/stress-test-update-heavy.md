# Update-Heavy Workload Benchmark

Tests performance when repeatedly updating existing rows vs creating new ones.

## What It Tests

- Update performance compared to initial upsert
- Performance degradation over multiple update rounds
- File size growth from updates vs inserts

## Methodology

1. **Setup**: Create initial dataset (5k items × 5 tables = 25k items)
2. **Update rounds**: Repeatedly update all rows multiple times (default 3 rounds)
3. Measure performance and file size after each phase

## Key Questions Answered

- How does update performance compare to initial upsert?
- Does update performance degrade over multiple rounds?
- How does file size grow with updates vs inserts?

## Key Findings

From a test with 25k items (5k items × 5 tables):

| Phase | Items | Rate | File Size |
|-------|-------|------|-----------|
| Initial Setup | 25,000 | 51.7k/s | 3.58 MB |
| Update Round 1 | 25,000 | 31.5k/s | 4.69 MB |
| Update Round 2 | 25,000 | 23.5k/s | 5.65 MB |
| Update Round 3 | 25,000 | 20.6k/s | 6.61 MB |

### Key Observations

1. **Updates are ~40% of setup speed**: The last update round ran at 20.6k/s vs initial setup at 51.7k/s (39.9% relative speed).

2. **File grows ~1 MB per update round**: Each round of updating all 25k items added approximately 1 MB to the file size.

3. **Consistent degradation**: Performance decreases predictably with each round as YJS accumulates more operation history.

4. **Total overhead**: After 3 update rounds, file size grew 84.5% (from 3.58 MB to 6.61 MB).

### Update vs Insert Comparison

| Metric | Initial Insert | Update (Round 3) |
|--------|---------------|------------------|
| Speed | 51.7k/s | 20.6k/s |
| Bytes/item | ~143 bytes | +40 bytes/update |

## Interpretation

This benchmark simulates applications where data is frequently modified rather than just appended. Common use cases include:

- Note-taking apps where users edit existing notes
- Task managers where task status changes frequently
- Form builders where field values are updated

The ~40% speed ratio for updates vs inserts is reasonable for CRDT operations, and the ~1 MB per update round is predictable for capacity planning.
