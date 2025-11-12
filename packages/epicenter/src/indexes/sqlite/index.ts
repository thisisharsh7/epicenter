/**
 * SQLite index - Syncs YJS changes to SQLite database
 *
 * Main entry point for the SQLite index. Exports the sqliteIndex function
 * and utilities for working with Drizzle schemas.
 */

// Main index implementation
export { sqliteIndex } from './sqlite-index';

// Utilities for schema conversion
export { convertWorkspaceSchemaToDrizzle } from './schema-converter';
