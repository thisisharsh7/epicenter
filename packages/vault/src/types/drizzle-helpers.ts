/**
 * Type utilities for Drizzle ORM integration
 * Provides proper types to replace `any` usage throughout the codebase
 */

import type {
	SQLiteTable,
	SQLiteColumn,
	SQLiteSelectQueryBuilder,
	SQLiteSelectQueryBuilderHKT,
} from 'drizzle-orm/sqlite-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

/**
 * Constraint for tables that have an id column
 * Used to ensure type safety when accessing table.id
 */
export type TableWithId<T extends SQLiteTable = SQLiteTable> = T & {
	id: SQLiteColumn;
};

/**
 * Generic data record type for storage operations
 */
export type StorageData = Record<string, unknown>;

/**
 * Select query builder type for a specific table
 * This is the return type of table.select()
 */
export type TableSelectBuilder<T extends SQLiteTable> =
	SQLiteSelectQueryBuilder<
		SQLiteSelectQueryBuilderHKT,
		string, // table name
		'sync', // result type
		void, // run result
		InferSelectModel<T>, // selection
		'single', // select mode
		Record<string, 'not-null'> // nullability map
	>;

/**
 * Result type for database operations that return a count
 */
export type CountResult = {
	count: number;
};

/**
 * Result type for database operations that affect rows
 */
export type AffectedRowsResult = {
	rowsAffected: number;
	changes: number;
};

/**
 * Type for plugin method signatures
 * More specific than `any` but still flexible
 */
export type PluginMethod = (...args: unknown[]) => unknown;

/**
 * Type for a collection of plugin methods
 */
export type PluginMethods = Record<string, PluginMethod>;

/**
 * Type for plugin dependencies map
 */
export type PluginDependencies = Record<string, unknown>;

/**
 * Type for plugin tables map with enhanced helpers
 */
export type PluginTables = Record<
	string,
	SQLiteTable & Record<string, unknown>
>;

/**
 * Helper to extract the ID type from a table
 * Assumes all tables have an id column of type string
 */
export type ExtractIdType<T extends SQLiteTable> = string;

/**
 * Type guard to check if a table has an id column
 */
export function hasIdColumn(table: SQLiteTable): table is TableWithId {
	return 'id' in table;
}

/**
 * Helper to build a SQL count expression
 */
export function countExpression(): SQL<number> {
	return SQL`count(*)`;
}

/**
 * Type for the vault context passed to plugin methods
 * This is a recursive type that builds up based on plugin dependencies
 */
export type VaultContext<
	TPlugins extends Record<string, unknown> = Record<string, unknown>,
> = TPlugins;

/**
 * Type for runtime storage operations
 */
export type StorageOperations = {
	path?: string;
	write: (table: string, id: string, data: StorageData) => Promise<void>;
	update: (table: string, id: string, data: StorageData) => Promise<void>;
	delete: (table: string, id: string) => Promise<void>;
};

/**
 * Type for aggregated plugin namespace
 */
export type AggregatedPluginNamespace<
	TPlugins extends Record<string, unknown> = Record<string, unknown>,
> = TPlugins;
