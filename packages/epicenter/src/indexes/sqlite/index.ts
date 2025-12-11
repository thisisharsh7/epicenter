/**
 * SQLite provider - Syncs YJS changes to SQLite database
 *
 * Main entry point for the SQLite provider. Exports the sqliteProvider function
 * and utilities for working with Drizzle schemas.
 */

// Schema utilities (builders + converter)
export type { WorkspaceSchemaToDrizzleTables } from './schema';
export {
	boolean,
	convertTableSchemaToDrizzle,
	convertWorkspaceSchemaToDrizzle,
	date,
	id,
	integer,
	real,
	tags,
	text,
} from './schema';
// Main provider implementation
export { sqliteProvider } from './sqlite-index';
