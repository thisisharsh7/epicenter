/**
 * SQLite provider - Syncs YJS changes to SQLite database
 *
 * Main entry point for the SQLite provider. Exports the sqliteProvider function
 * and utilities for working with Drizzle schemas.
 */

// Schema converters (Epicenter → Drizzle)
export type { WorkspaceSchemaToDrizzleTables } from '../../core/schema/converters/to-drizzle';
export {
	convertTableSchemaToDrizzle,
	convertWorkspaceSchemaToDrizzle,
} from '../../core/schema/converters/to-drizzle';

// Column builders for defining Drizzle schemas
export { boolean, date, id, integer, real, tags, text } from './builders';

// Main provider implementation
export { sqliteProvider } from './sqlite-provider';
