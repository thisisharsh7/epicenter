/**
 * SQLite index - Syncs YJS changes to SQLite database
 *
 * Main entry point for the SQLite index. Exports the sqliteIndex function
 * and utilities for working with Drizzle schemas.
 */

// Main index implementation
export { sqliteIndex } from './sqlite-index';

// Schema utilities (builders + converter)
export type { WorkspaceSchemaToDrizzleTables } from './schema';
export {
	convertWorkspaceSchemaToDrizzle,
	convertTableSchemaToDrizzle,
	id,
	text,
	integer,
	real,
	boolean,
	date,
	tags,
} from './schema';
