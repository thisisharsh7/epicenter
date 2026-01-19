import { regex } from 'arkregex';
import type * as Y from 'yjs';
import type { TableDefinitionMap } from '../schema';
import { createTableHelpers, type TableHelper } from './table-helper';

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
const TABLE_NAME_PATTERN = regex('^[a-z][a-z0-9_]*$');

/**
 * Valid column name pattern: camelCase allowed.
 *
 * Column names must satisfy:
 * - **SQLite**: Valid unquoted column identifier (camelCase works)
 * - **JavaScript**: `row.columnName` dot notation access
 * - **YAML frontmatter**: Markdown index serializes columns to frontmatter keys
 *
 * Unlike table names (which affect file system paths), column names don't need
 * to be lowercase-only. camelCase is idiomatic JavaScript and works everywhere.
 */
const COLUMN_NAME_PATTERN = regex('^[a-z][a-zA-Z0-9_]*$');

// Re-export types for public API
export type {
	GetResult,
	InvalidRowResult,
	RowResult,
	TableHelper,
	TableRowChange,
	ValidRowResult,
} from './table-helper';

/**
 * Create an Epicenter database wrapper with table helpers from an existing Y.Doc.
 * This is a pure function that doesn't handle persistence - it only wraps
 * the Y.Doc with type-safe table operations.
 *
 * Accepts `TableDefinitionMap` with fully normalized tables. Use `table()` helper
 * for ergonomic table definitions—it handles normalization.
 *
 * ## API Design
 *
 * Tables are accessed directly on the db object. The only non-table property
 * is `clearAll`, which is a mutation action to clear all tables.
 *
 * @param ydoc - An existing Y.Doc instance (already loaded/initialized)
 * @param tableDefinitions - Table definitions (use `table()` helper for ergonomic definitions)
 * @returns Object with flattened table helpers and a clearAll mutation
 *
 * @example
 * ```typescript
 * const ydoc = new Y.Doc({ guid: 'workspace-123' });
 * const db = createTables(ydoc, {
 *   posts: table({
 *     name: 'Posts',
 *     fields: { id: id(), title: text(), published: boolean() },
 *   }),
 *   users: table({
 *     name: 'Users',
 *     description: 'User accounts',
 *     icon: '👤',
 *     fields: { id: id(), title: text(), published: boolean() },
 *   }),
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
export function createTables<TTableDefinitionMap extends TableDefinitionMap>(
	ydoc: Y.Doc,
	tableDefinitions: TTableDefinitionMap,
) {
	// Validate table names
	for (const tableName of Object.keys(tableDefinitions)) {
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
	for (const [tableName, tableDefinition] of Object.entries(tableDefinitions)) {
		for (const columnName of Object.keys(tableDefinition.fields)) {
			if (!COLUMN_NAME_PATTERN.test(columnName)) {
				throw new Error(
					`Column name "${columnName}" in table "${tableName}" is invalid: must start with a lowercase letter and contain only letters, numbers, and underscores (e.g., "title", "createdAt", "count2")`,
				);
			}
		}
	}

	const tableHelpers = createTableHelpers({ ydoc, tableDefinitions });

	return {
		...tableHelpers,

		/**
		 * The raw table definitions passed to createTables.
		 *
		 * Provides direct access to the `TableDefinitionMap` without going through
		 * table helpers. Useful when you need the complete definition including
		 * metadata (name, icon, description) or the raw `fields` schema.
		 *
		 * Primary use case: passing to converters like `convertTableDefinitionsToDrizzle`
		 * that need the full definition rather than individual table helpers.
		 *
		 * @example
		 * ```typescript
		 * // In a capability, convert to Drizzle tables
		 * const drizzleTables = convertTableDefinitionsToDrizzle(tables.$definitions);
		 *
		 * // Access table metadata
		 * const postsDefinition = tables.$definitions.posts;
		 * console.log(postsDefinition.name);        // "Posts"
		 * console.log(postsDefinition.description); // "Blog posts and articles"
		 * console.log(postsDefinition.fields);      // { id: {...}, title: {...}, ... }
		 * ```
		 */
		$definitions: tableDefinitions,

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
				TTableDefinitionMap[keyof TTableDefinitionMap]['fields']
			>[];
		},

		/**
		 * Zip tables with a configs object, returning type-safe paired entries.
		 *
		 * Replaces the error-prone `tables.$all().map()` pattern:
		 *
		 * ```typescript
		 * // BEFORE: Requires @ts-expect-error at every usage
		 * const tableWithConfigs = tables.$all().map(table => ({
		 *   table,
		 *   tableConfig: configs[table.name],
		 * }));
		 * for (const { table, tableConfig } of tableWithConfigs) {
		 *   // @ts-expect-error - TypeScript can't correlate table and config
		 *   tableConfig.serialize({ row, table });
		 * }
		 *
		 * // AFTER: Type-safe, rename 'paired' at destructure site
		 * for (const { table, paired: tableConfig } of tables.$zip(configs)) {
		 *   tableConfig.serialize({ row, table }); // Just works!
		 * }
		 * ```
		 *
		 * This solves TypeScript's "correlated record types" limitation where
		 * union types are evaluated independently during iteration.
		 *
		 * @see https://github.com/microsoft/TypeScript/issues/35101
		 * @see docs/articles/encapsulating-type-assertions.md
		 */
		$zip<
			TConfigs extends {
				[K in keyof TTableDefinitionMap & string]: unknown;
			},
		>(configs: TConfigs) {
			const names = Object.keys(tableDefinitions) as Array<
				keyof TTableDefinitionMap & string
			>;

			return names.map((name) => ({
				name,
				table: tableHelpers[name],
				paired: configs[name],
			})) as Array<
				{
					[K in keyof TTableDefinitionMap & string]: {
						name: K;
						table: TableHelper<TTableDefinitionMap[K]['fields']>;
						paired: TConfigs[K];
					};
				}[keyof TTableDefinitionMap & string]
			>;
		},

		/**
		 * Clear all tables in the workspace
		 */
		clearAll(): void {
			ydoc.transact(() => {
				for (const tableName of Object.keys(tableDefinitions)) {
					tableHelpers[tableName as keyof typeof tableHelpers].clear();
				}
			});
		},
	};
}

/**
 * Type alias for the return type of createTables.
 * Useful for typing function parameters that accept a tables instance.
 */
export type Tables<TTableDefinitionMap extends TableDefinitionMap> = ReturnType<
	typeof createTables<TTableDefinitionMap>
>;
