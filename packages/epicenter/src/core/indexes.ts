import type { Db } from '../db/core';
import type { Schema, TableSchema } from './column-schemas';

/**
 * Index type system for vault.
 * Indexes are synchronized snapshots of YJS data optimized for specific query patterns.
 */

/**
 * Index object with initialization function
 *
 * Indexes are objects with an `init` function that sets up observers and returns cleanup + queries
 * The index name/ID is provided by the object key in the workspace configuration
 *
 * @example
 * ```typescript
 * const sqliteIndex: Index<MySchema> = {
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
	TSchema extends Schema = Schema,
	TQueries = Record<string, any>,
> = {
	init: (db: Db<TSchema>) => {
		destroy: () => void | Promise<void>;
		queries: TQueries;
	};
};

/**
 * Context passed to index factory functions
 */
export type IndexContext<TSchema extends Schema = Schema> = {
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
	TSchema extends Schema,
	TQueries = Record<string, any>,
>(index: Index<TSchema, TQueries>): Index<TSchema, TQueries> {
	return index;
}

