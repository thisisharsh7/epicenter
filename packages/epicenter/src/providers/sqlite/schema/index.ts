/**
 * SQLite schema utilities
 *
 * Column builders and schema conversion tools for working with Drizzle ORM.
 */

export type { WorkspaceSchemaToDrizzleTables } from '../../../core/schema/fields/to-drizzle';

// Schema converter (Epicenter → Drizzle)
export {
	convertTableSchemaToDrizzle,
	convertWorkspaceSchemaToDrizzle,
} from '../../../core/schema/fields/to-drizzle';
// Column builders for defining Drizzle schemas
export { boolean, date, id, integer, real, tags, text } from './builders';
