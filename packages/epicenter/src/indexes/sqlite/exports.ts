/**
 * SQLite index subpath exports
 *
 * Export SQLite-specific utilities (if any are needed for custom usage).
 * Currently the SQLite index is fully self-contained, but this subpath
 * is provided for consistency and future extensibility.
 */

// Re-export the index function (already exported from main barrel)
export { sqliteIndex } from './index';
