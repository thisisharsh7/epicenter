/**
 * SQLite schema utilities
 *
 * Column builders and schema conversion tools for working with Drizzle ORM.
 */

// Column builders for defining Drizzle schemas
export { id, text, integer, real, boolean, date, tags } from './builders';

// Schema converter (Epicenter → Drizzle)
export {
	convertWorkspaceSchemaToDrizzle,
	convertTableSchemaToDrizzle,
} from './converter';
export type { WorkspaceSchemaToDrizzleTables } from './converter';
