import { regex } from 'arkregex';
import type * as Y from 'yjs';
import type { TableDefinitionMap } from '../schema';
import {
	createTableHelpers,
	createUntypedTableHelper,
	type TableHelper,
	type TablesMap,
	type UntypedTableHelper,
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
	RowMap,
	RowResult,
	TableHelper,
	TableMap,
	TableRowChange,
	TablesMap,
	UntypedTableHelper,
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
	const ytables: TablesMap = ydoc.getMap('tables');

	// Cache for dynamically-created table helpers (tables not in schema)
	const dynamicTableHelpers = new Map<string, UntypedTableHelper>();

	/**
	 * Get or create an untyped table helper for a dynamic table.
	 */
	const getOrCreateDynamicHelper = (name: string): UntypedTableHelper => {
		let helper = dynamicTableHelpers.get(name);
		if (!helper) {
			helper = createUntypedTableHelper({ ydoc, tableName: name, ytables });
			dynamicTableHelpers.set(name, helper);
		}
		return helper;
	};

	const definedTableNames = Object.keys(tableDefinitions) as Array<
		keyof TTableDefinitionMap & string
	>;

	// We need to define the table function separately due to overloads
	function tableAccessor<K extends keyof TTableDefinitionMap & string>(
		name: K,
	): TableHelper<TTableDefinitionMap[K]['fields']>;
	function tableAccessor(name: string): UntypedTableHelper;
	function tableAccessor(
		name: string,
	):
		| TableHelper<TTableDefinitionMap[keyof TTableDefinitionMap]['fields']>
		| UntypedTableHelper {
		// Check if it's a defined table first
		if (name in tableHelpers) {
			return tableHelpers[name as keyof typeof tableHelpers];
		}
		// Otherwise return/create a dynamic helper
		return getOrCreateDynamicHelper(name);
	}

	return {
		...tableHelpers,

		// ════════════════════════════════════════════════════════════════════
		// DYNAMIC ACCESS
		// ════════════════════════════════════════════════════════════════════

		/**
		 * Get a table helper by name. Creates the table if it doesn't exist.
		 *
		 * This is the universal accessor for tables:
		 * - For defined tables (in schema): returns fully-typed TableHelper
		 * - For undefined tables (dynamic): returns UntypedTableHelper with unknown rows
		 *
		 * The underlying Y.Map is created lazily on first write operation.
		 *
		 * @example
		 * ```typescript
		 * // Defined table - fully typed
		 * tables.table('posts').getAll()  // { id, title }[]
		 *
		 * // Dynamic table - untyped
		 * tables.table('custom').getAll()  // unknown[]
		 * tables.table('custom').upsert({ id: '1', anything: 'goes' })
		 *
		 * // With variable
		 * const name = 'posts' as const
		 * tables.table(name).getAll()  // Still typed!
		 * ```
		 */
		table: tableAccessor,

		/**
		 * Check if a table exists in YJS storage (without creating it).
		 *
		 * Use this when you need to check existence before performing operations,
		 * without triggering table creation.
		 *
		 * @example
		 * ```typescript
		 * if (tables.has('custom')) {
		 *   // Table exists, safe to read
		 *   const rows = tables.table('custom').getAll()
		 * }
		 * ```
		 */
		has(name: string): boolean {
			return ytables.has(name);
		},

		// ════════════════════════════════════════════════════════════════════
		// ITERATION - ALL TABLES
		// ════════════════════════════════════════════════════════════════════

		/**
		 * Get all table helpers that exist in YJS (defined + undefined).
		 *
		 * Returns helpers for every table that has been created in YJS storage,
		 * including both schema-defined tables and dynamically-created tables.
		 *
		 * @example
		 * ```typescript
		 * for (const helper of tables.all()) {
		 *   console.log(helper.name, helper.count())
		 * }
		 * ```
		 */
		all(): UntypedTableHelper[] {
			const helpers: UntypedTableHelper[] = [];
			for (const name of ytables.keys()) {
				if (name in tableHelpers) {
					helpers.push(
						tableHelpers[
							name as keyof typeof tableHelpers
						] as UntypedTableHelper,
					);
				} else {
					helpers.push(getOrCreateDynamicHelper(name));
				}
			}
			return helpers;
		},

		/**
		 * Get all table names that exist in YJS storage.
		 *
		 * Returns names of every table that has been created, including both
		 * schema-defined tables and dynamically-created tables.
		 *
		 * @example
		 * ```typescript
		 * tables.names()  // ['posts', 'users', 'custom_123', ...]
		 * ```
		 */
		names(): string[] {
			return Array.from(ytables.keys());
		},

		// ════════════════════════════════════════════════════════════════════
		// ITERATION - DEFINED TABLES ONLY
		// ════════════════════════════════════════════════════════════════════

		/**
		 * Get table helpers for only schema-defined tables.
		 *
		 * Returns only tables that were declared in the schema definition,
		 * with full type information preserved.
		 *
		 * @example
		 * ```typescript
		 * for (const helper of tables.defined()) {
		 *   console.log(helper.name)  // 'posts' | 'users'
		 * }
		 * ```
		 */
		defined() {
			return Object.values(tableHelpers) as TableHelper<
				TTableDefinitionMap[keyof TTableDefinitionMap]['fields']
			>[];
		},

		/**
		 * Get names of only schema-defined tables.
		 *
		 * @example
		 * ```typescript
		 * tables.definedNames()  // ['posts', 'users']
		 * ```
		 */
		definedNames(): (keyof TTableDefinitionMap & string)[] {
			return [...definedTableNames];
		},

		/**
		 * Zip defined tables with a configs object, returning type-safe paired entries.
		 *
		 * This solves TypeScript's "correlated record types" limitation where
		 * union types are evaluated independently during iteration.
		 *
		 * @example
		 * ```typescript
		 * for (const { name, table, paired: config } of tables.zip(configs)) {
		 *   config.serialize({ row, table })  // Fully typed!
		 * }
		 * ```
		 *
		 * @see https://github.com/microsoft/TypeScript/issues/35101
		 */
		zip<
			TConfigs extends {
				[K in keyof TTableDefinitionMap & string]: unknown;
			},
		>(configs: TConfigs) {
			return definedTableNames.map((name) => ({
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

		// ════════════════════════════════════════════════════════════════════
		// METADATA & ESCAPE HATCHES
		// ════════════════════════════════════════════════════════════════════

		/**
		 * The raw table definitions passed to createTables.
		 *
		 * Provides access to the schema definition including metadata
		 * (name, icon, description) and field schemas.
		 *
		 * @example
		 * ```typescript
		 * tables.definitions.posts.fields  // { id: {...}, title: {...} }
		 * ```
		 */
		definitions: tableDefinitions,

		/**
		 * Direct access to the underlying Y.Map storing all tables.
		 *
		 * **Escape hatch for advanced use cases.** Bypasses all validation
		 * and type safety.
		 *
		 * @example
		 * ```typescript
		 * ydoc.transact(() => {
		 *   const rawTable = tables.raw.get('posts')
		 *   // Direct Y.Map manipulation...
		 * })
		 * ```
		 */
		raw: ytables,

		// ════════════════════════════════════════════════════════════════════
		// BULK OPERATIONS
		// ════════════════════════════════════════════════════════════════════

		/**
		 * Clear all rows in defined tables.
		 *
		 * Only clears tables that are in the schema definition.
		 * Does not affect dynamically-created tables.
		 */
		clearAll(): void {
			ydoc.transact(() => {
				for (const tableName of definedTableNames) {
					tableHelpers[tableName as keyof typeof tableHelpers].clear();
				}
			});
		},

		/**
		 * Delete a table entirely from YJS storage.
		 *
		 * Removes the table and all its rows. Use with caution.
		 *
		 * @returns true if the table existed and was deleted, false otherwise
		 *
		 * @example
		 * ```typescript
		 * tables.drop('temporary_data')  // true if deleted
		 * ```
		 */
		drop(name: string): boolean {
			if (!ytables.has(name)) {
				return false;
			}
			ytables.delete(name);
			dynamicTableHelpers.delete(name);
			return true;
		},

		// ════════════════════════════════════════════════════════════════════
		// DEPRECATED - Keep for backward compatibility
		// ════════════════════════════════════════════════════════════════════

		/**
		 * @deprecated Use `tables.raw` instead
		 */
		get $raw() {
			return ytables;
		},

		/**
		 * @deprecated Use `tables.definitions` instead
		 */
		get $definitions() {
			return tableDefinitions;
		},

		/**
		 * @deprecated Use `tables.defined()` instead
		 */
		$all() {
			return Object.values(tableHelpers) as TableHelper<
				TTableDefinitionMap[keyof TTableDefinitionMap]['fields']
			>[];
		},

		/**
		 * @deprecated Use `tables.zip()` instead
		 */
		$zip<
			TConfigs extends {
				[K in keyof TTableDefinitionMap & string]: unknown;
			},
		>(configs: TConfigs) {
			return definedTableNames.map((name) => ({
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
	};
}

/**
 * Type alias for the return type of createTables.
 * Useful for typing function parameters that accept a tables instance.
 */
export type Tables<TTableDefinitionMap extends TableDefinitionMap> = ReturnType<
	typeof createTables<TTableDefinitionMap>
>;
