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

## Expected Findings

_Run the benchmark to populate this section with actual results._

Typical patterns to look for:

- **Update vs Insert speed**: Updates should be similar or slightly slower than inserts since both operations need to locate and modify data
- **File growth**: Each update round should add some overhead due to operation history, but less than an equivalent insert
- **Degradation**: Performance may degrade slightly over rounds as the YJS document accumulates more history

## Interpretation

This benchmark simulates applications where data is frequently modified rather than just appended. Common use cases include:

- Note-taking apps where users edit existing notes
- Task managers where task status changes frequently
- Form builders where field values are updated
