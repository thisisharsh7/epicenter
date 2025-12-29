import * as Y from 'yjs';
import { defineMutation } from '../actions';
import type { WorkspaceSchema } from '../schema';
import { createWorkspaceValidators } from '../schema';
import {
	createTableHelpers,
	type TableHelper,
	type YRow,
} from './table-helper';

/**
 * Valid table name pattern: lowercase letters, numbers, and underscores, starting with a letter.
 *
 * Table names must satisfy constraints across three systems:
 *
 * **File System** (markdown index creates directories from table names):
 * - Cross-platform safety: Windows, macOS, and Linux all handle these characters
 * - Case-insensitivity: Windows/macOS treat "Posts" and "posts" as the same directory
 * - Avoids reserved names: No risk of collision with CON, PRN, AUX, NUL, etc.
 *
 * **SQLite** (sqlite index creates tables from table names):
 * - Valid unquoted identifier: No need for "quoted" table names in SQL
 * - Avoids reserved words: Starting with letter + limited charset avoids most conflicts
 * - Case-insensitive by default: Lowercase-only prevents subtle bugs
 *
 * **JavaScript** (table names become object properties for `db.tableName` access):
 * - Valid identifier: Enables dot notation instead of bracket notation
 * - No leading numbers: JS identifiers can't start with digits
 *
 * The pattern `/^[a-z][a-z0-9_]*$/` is the intersection of all three constraint sets.
 *
 * **Why not hyphens?** SQLite requires quoting (`"my-table"`), JS needs brackets (`db['my-table']`)
 * **Why not uppercase?** Case-sensitivity varies; lowercase-only is predictable everywhere
 * **Why start with letter?** SQL/JS identifiers starting with numbers need special handling
 */
const TABLE_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * Valid column name pattern: same constraints as table names.
 *
 * Column names appear in the same three systems and have identical requirements:
 * - **SQLite**: Valid unquoted column identifier
 * - **JavaScript**: `row.columnName` dot notation access
 * - **YAML frontmatter**: Markdown index serializes columns to frontmatter keys
 *
 * @see TABLE_NAME_PATTERN for detailed constraint rationale
 */
const COLUMN_NAME_PATTERN = TABLE_NAME_PATTERN;

// Re-export TableHelper for public API
export type { TableHelper } from './table-helper';

/**
 * Create an Epicenter database wrapper with table helpers from an existing Y.Doc.
 * This is a pure function that doesn't handle persistence - it only wraps
 * the Y.Doc with type-safe table operations.
 *
 * ## API Design
 *
 * Tables are accessed directly on the db object. The only non-table property
 * is `clearAll`, which is a mutation action to clear all tables.
 *
 * @param ydoc - An existing Y.Doc instance (already loaded/initialized)
 * @param schema - Table schema definitions
 * @returns Object with flattened table helpers and a clearAll mutation
 *
 * @example
 * ```typescript
 * const ydoc = new Y.Doc({ guid: 'workspace-123' });
 * const db = createEpicenterDb(ydoc, {
 *   posts: {
 *     id: id(),
 *     title: text(),
 *     published: boolean(),
 *   }
 * });
 *
 * // Tables are accessed directly
 * db.posts.upsert({ id: '1', title: 'Hello', published: false });
 * db.posts.getAll();
 *
 * // Clear all tables
 * db.clearAll();
 * ```
 */
export function createEpicenterDb<TWorkspaceSchema extends WorkspaceSchema>(
	ydoc: Y.Doc,
	schema: TWorkspaceSchema,
) {
	// Validate table names
	for (const tableName of Object.keys(schema)) {
		if (tableName.startsWith('$')) {
			throw new Error(
				`Table name "${tableName}" is invalid: cannot start with "$" (reserved for utilities)`,
			);
		}
		if (!TABLE_NAME_PATTERN.test(tableName)) {
			throw new Error(
				`Table name "${tableName}" is invalid: must start with a lowercase letter and contain only lowercase letters, numbers, and underscores (e.g., "posts", "user_sessions", "items2")`,
			);
		}
	}

	// Validate column names for each table
	for (const [tableName, tableSchema] of Object.entries(schema)) {
		for (const columnName of Object.keys(tableSchema)) {
			if (!COLUMN_NAME_PATTERN.test(columnName)) {
				throw new Error(
					`Column name "${columnName}" in table "${tableName}" is invalid: must start with a lowercase letter and contain only lowercase letters, numbers, and underscores (e.g., "title", "created_at", "count2")`,
				);
			}
		}
	}

	// Create validators for all tables
	const validators = createWorkspaceValidators(schema);
	const ytables = ydoc.getMap<Y.Map<YRow>>('tables');

	// Create table helpers (tables are created lazily via getYTable - see table-helper.ts)
	const tableHelpers = createTableHelpers({
		ydoc,
		schema,
		validators,
		ytables,
	});

	return {
		...tableHelpers,

		/**
		 * Get all table helpers as an array.
		 *
		 * Useful for providers and indexes that need to iterate over all tables.
		 * Returns only the table helpers, excluding utility methods like `clearAll`.
		 *
		 * @example
		 * ```typescript
		 * for (const table of tables.$all()) {
		 *   console.log(table.name, table.count());
		 * }
		 *
		 * const tableWithConfigs = tables.$all().map(table => ({
		 *   table,
		 *   config: configs[table.name],
		 * }));
		 * ```
		 */
		$all() {
			return Object.values(tableHelpers) as TableHelper<
				TWorkspaceSchema[keyof TWorkspaceSchema]
			>[];
		},

		clearAll: defineMutation({
			description: 'Clear all tables in the workspace',
			handler: () => {
				ydoc.transact(() => {
					for (const tableName of Object.keys(schema)) {
						tableHelpers[tableName as keyof typeof tableHelpers].clear();
					}
				});
			},
		}),
	};
}

/**
 * Type alias for the return type of createEpicenterDb.
 * Useful for typing function parameters that accept a tables instance.
 */
export type Tables<TWorkspaceSchema extends WorkspaceSchema> = ReturnType<
	typeof createEpicenterDb<TWorkspaceSchema>
>;
