import type * as Y from 'yjs';
import type { TableDefinitionMap } from '../schema';
import {
	createTableHelpers,
	createUntypedTableHelper,
	type TableHelper,
	type TablesMap,
	type UntypedTableHelper,
} from './table-helper';

// Re-export types for public API
export type {
	GetResult,
	InvalidRowResult,
	RowAction,
	RowChanges,
	RowMap,
	RowResult,
	TableHelper,
	TableMap,
	TablesMap,
	UntypedTableHelper,
	ValidRowResult,
} from './table-helper';

/**
 * Callable function type for accessing tables.
 *
 * The tables object is a callable function: `tables('posts')` returns a TableHelper.
 * It also has properties for utility methods: `tables.has()`, `tables.names()`, etc.
 *
 * This pattern eliminates collision risk between user-defined table names and
 * utility methods, since user names only appear as function arguments.
 */
export type TablesFunction<TTableDefinitionMap extends TableDefinitionMap> = {
	// ════════════════════════════════════════════════════════════════════
	// CALL SIGNATURES
	// ════════════════════════════════════════════════════════════════════

	/**
	 * Get a table helper by name (typed version for defined tables).
	 *
	 * @example
	 * ```typescript
	 * tables('posts').getAll()  // Row[] - fully typed
	 * ```
	 */
	<K extends keyof TTableDefinitionMap & string>(
		name: K,
	): TableHelper<TTableDefinitionMap[K]['fields']>;

	/**
	 * Get a table helper by name (untyped version for dynamic tables).
	 *
	 * @example
	 * ```typescript
	 * tables('dynamic').getAll()  // unknown[]
	 * ```
	 */
	(name: string): UntypedTableHelper;

	// ════════════════════════════════════════════════════════════════════
	// EXISTENCE & ENUMERATION
	// ════════════════════════════════════════════════════════════════════

	/**
	 * Check if a table exists in YJS storage (without creating it).
	 */
	has(name: string): boolean;

	/**
	 * Get all table names that exist in YJS storage.
	 */
	names(): string[];

	/**
	 * Get names of only definition-declared tables.
	 */
	definedNames(): (keyof TTableDefinitionMap & string)[];

	/**
	 * Get table helpers for only definition-declared tables.
	 */
	defined(): TableHelper<
		TTableDefinitionMap[keyof TTableDefinitionMap]['fields']
	>[];

	// ════════════════════════════════════════════════════════════════════
	// BULK OPERATIONS
	// ════════════════════════════════════════════════════════════════════

	/**
	 * Clear all rows in defined tables.
	 */
	clear(): void;

	// ════════════════════════════════════════════════════════════════════
	// METADATA
	// ════════════════════════════════════════════════════════════════════

	/**
	 * The raw table definitions passed to createTables.
	 */
	definitions: TTableDefinitionMap;

	// ════════════════════════════════════════════════════════════════════
	// UTILITIES
	// ════════════════════════════════════════════════════════════════════

	/**
	 * Serialize all tables to JSON.
	 */
	toJSON(): Record<string, unknown[]>;

	/**
	 * Zip defined tables with a configs object, returning type-safe paired entries.
	 */
	zip<
		TConfigs extends {
			[K in keyof TTableDefinitionMap & string]: unknown;
		},
	>(
		configs: TConfigs,
	): Array<
		{
			[K in keyof TTableDefinitionMap & string]: {
				name: K;
				table: TableHelper<TTableDefinitionMap[K]['fields']>;
				paired: TConfigs[K];
			};
		}[keyof TTableDefinitionMap & string]
	>;
};

/**
 * Create an Epicenter database wrapper with table helpers from an existing Y.Doc.
 * This is a pure function that doesn't handle persistence - it only wraps
 * the Y.Doc with type-safe table operations.
 *
 * The returned object is a **callable function** that returns table helpers.
 * Utility methods are properties on the function itself.
 *
 * ## API Design
 *
 * Tables are accessed by calling the function: `tables('posts')`.
 * Utilities are properties: `tables.has()`, `tables.clear()`, etc.
 * This eliminates collision risk between user table names and utility methods.
 *
 * @param ydoc - An existing Y.Doc instance (already loaded/initialized)
 * @param tableDefinitions - Table definitions (use `table()` helper for ergonomic definitions)
 * @returns Callable function with table helpers and utility methods
 *
 * @example
 * ```typescript
 * const ydoc = new Y.Doc({ guid: 'workspace-123' });
 * const tables = createTables(ydoc, {
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
 * // Tables are accessed by calling the function
 * tables('posts').upsert({ id: '1', title: 'Hello', published: false });
 * tables('posts').getAll();
 *
 * // Clear all tables
 * tables.clear();
 *
 * // With destructuring (unchanged ergonomics)
 * const posts = tables('posts');
 * posts.upsert({ id: '1', title: 'Hello', published: false });
 * ```
 */
export function createTables<TTableDefinitionMap extends TableDefinitionMap>(
	ydoc: Y.Doc,
	tableDefinitions: TTableDefinitionMap,
): TablesFunction<TTableDefinitionMap> {
	const tableHelpers = createTableHelpers({ ydoc, tableDefinitions });
	const ytables: TablesMap = ydoc.getMap('tables');

	// Cache for dynamically-created table helpers (tables not in definition)
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

	// ════════════════════════════════════════════════════════════════════
	// BUILD CALLABLE FUNCTION WITH PROPERTIES
	// ════════════════════════════════════════════════════════════════════

	/**
	 * The main accessor function. Call with a table name to get a helper.
	 */
	const tablesAccessor = (
		name: string,
	):
		| TableHelper<TTableDefinitionMap[keyof TTableDefinitionMap]['fields']>
		| UntypedTableHelper => {
		// Check if it's a defined table first
		if (name in tableHelpers) {
			return tableHelpers[name as keyof typeof tableHelpers];
		}
		// Otherwise return/create a dynamic helper
		return getOrCreateDynamicHelper(name);
	};

	// Use Object.assign for cleaner property attachment
	return Object.assign(tablesAccessor, {
		// ════════════════════════════════════════════════════════════════════
		// EXISTENCE & ENUMERATION
		// ════════════════════════════════════════════════════════════════════

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
		 *   const rows = tables('custom').getAll()
		 * }
		 * ```
		 */
		has(name: string): boolean {
			return ytables.has(name);
		},

		/**
		 * Get all table names that exist in YJS storage.
		 *
		 * Returns names of every table that has been created, including both
		 * definition-declared tables and dynamically-created tables.
		 *
		 * @example
		 * ```typescript
		 * tables.names()  // ['posts', 'users', 'custom_123', ...]
		 * ```
		 */
		names(): string[] {
			return Array.from(ytables.keys());
		},

		/**
		 * Get names of only definition-declared tables.
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
		 * Get table helpers for only definition-declared tables.
		 *
		 * Returns only tables that were declared in the workspace definition,
		 * with full type information preserved.
		 *
		 * @example
		 * ```typescript
		 * for (const helper of tables.defined()) {
		 *   console.log(helper.name)  // 'posts' | 'users'
		 * }
		 * ```
		 */
		defined(): TableHelper<
			TTableDefinitionMap[keyof TTableDefinitionMap]['fields']
		>[] {
			return Object.values(tableHelpers) as TableHelper<
				TTableDefinitionMap[keyof TTableDefinitionMap]['fields']
			>[];
		},

		// ════════════════════════════════════════════════════════════════════
		// BULK OPERATIONS
		// ════════════════════════════════════════════════════════════════════

		/**
		 * Clear all rows in defined tables.
		 *
		 * Only clears tables that are in the workspace definition.
		 * Does not affect dynamically-created tables.
		 */
		clear(): void {
			ydoc.transact(() => {
				for (const tableName of definedTableNames) {
					tableHelpers[tableName as keyof typeof tableHelpers].clear();
				}
			});
		},

		// ════════════════════════════════════════════════════════════════════
		// METADATA & ESCAPE HATCHES
		// ════════════════════════════════════════════════════════════════════

		/**
		 * The raw table definitions passed to createTables.
		 *
		 * Provides access to the table definitions including metadata
		 * (name, icon, description) and field schemas.
		 *
		 * @example
		 * ```typescript
		 * tables.definitions.posts.fields  // { id: {...}, title: {...} }
		 * ```
		 */
		definitions: tableDefinitions,

		// ════════════════════════════════════════════════════════════════════
		// UTILITIES
		// ════════════════════════════════════════════════════════════════════

		/**
		 * Serialize all tables to JSON.
		 *
		 * Returns an object where keys are table names and values are arrays
		 * of rows (as plain objects). Useful for debugging or serialization.
		 *
		 * @example
		 * ```typescript
		 * const data = tables.toJSON();
		 * // { posts: [{ id: '1', title: 'Hello' }], users: [...] }
		 * ```
		 */
		toJSON(): Record<string, unknown[]> {
			const result: Record<string, unknown[]> = {};
			for (const name of ytables.keys()) {
				const helper =
					name in tableHelpers
						? tableHelpers[name as keyof typeof tableHelpers]
						: getOrCreateDynamicHelper(name);
				result[name] = helper.getAllValid();
			}
			return result;
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
	}) as TablesFunction<TTableDefinitionMap>;
}

/**
 * Type alias for the return type of createTables.
 * Useful for typing function parameters that accept a tables instance.
 */
export type Tables<TTableDefinitionMap extends TableDefinitionMap> = ReturnType<
	typeof createTables<TTableDefinitionMap>
>;
