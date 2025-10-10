import type { Db } from '../db/core';
import type { TableSchema } from './column-schemas';

/**
 * Index type system for vault.
 * Indexes are synchronized snapshots of YJS data optimized for specific query patterns.
 */

/**
 * Index object with ID and initialization function
 *
 * Indexes are objects with:
 * 1. An `id` property for unique identification
 * 2. An `init` function that sets up observers and returns cleanup + queries
 *
 * @example
 * ```typescript
 * const sqliteIndex: Index<MySchema, 'sqlite'> = {
 *   id: 'sqlite',
 *   init(db) {
 *     // Register observers
 *     const unsubPosts = db.tables.posts.observe({
 *       onAdd: (row) => { indexPost(row); },
 *       onUpdate: (row) => { reindexPost(row); },
 *       onDelete: (id) => { removePost(id); },
 *     });
 *
 *     // Initialization
 *     initializeIndex();
 *
 *     // Return cleanup function and query methods
 *     return {
 *       destroy() {
 *         unsubPosts();
 *         cleanupIndex();
 *       },
 *       queries: {
 *         search: (query: string) => { ... },
 *         getAll: () => { ... },
 *       },
 *     };
 *   }
 * };
 * ```
 */
export type Index<
	TSchema extends Record<string, TableSchema> = Record<string, TableSchema>,
	TId extends string = string,
	TQueries = Record<string, any>,
> = {
	id: TId;
	init: (db: Db<TSchema>) => {
		destroy: () => void | Promise<void>;
		queries: TQueries;
	};
};

/**
 * Context passed to index factory functions
 */
export type IndexContext<
	TSchema extends Record<string, TableSchema> = Record<string, TableSchema>,
> = {
	/**
	 * The Epicenter database object with high-level CRUD methods
	 * Use methods like getAllRows(), getRow(), etc. instead of raw YJS access
	 * Table schemas are available via db.schema
	 * Workspace ID is available via db.ydoc.guid
	 */
	db: Db<TSchema>;
};

/**
 * Define an index with type safety
 *
 * @example
 * ```typescript
 * const sqliteIndex = defineIndex({
 *   id: 'sqlite',
 *   init: (db) => ({
 *     queries: {
 *       findById: async (id: string) => { ... }
 *     },
 *     destroy: () => { ... }
 *   })
 * })
 * ```
 */
export function defineIndex<
	TSchema extends Record<string, TableSchema>,
	TId extends string,
	TQueries = Record<string, any>,
>(index: Index<TSchema, TId, TQueries>): Index<TSchema, TId, TQueries> {
	return index;
}

/**
 * Infer indexes object from readonly array of indexes
 * Converts array to record keyed by index IDs with queries as values
 */
export type InferIndexes<T extends readonly Index<any, string, any>[]> = {
	[K in T[number] as K['id']]: K extends Index<any, any, infer TQueries>
		? TQueries
		: never;
};
