import type { Db } from '../db/core';
import type { WorkspaceSchema } from './schema';

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
	TWorkspaceSchema extends WorkspaceSchema = WorkspaceSchema,
	TQueries = Record<string, any>,
> = {
	init: (db: Db<TWorkspaceSchema>) => Promise<{
		destroy: () => void | Promise<void>;
		queries: TQueries;
	}> | {
		destroy: () => void | Promise<void>;
		queries: TQueries;
	};
};

/**
 * A collection of workspace indexes indexed by index name.
 *
 * Each workspace can have multiple indexes (SQLite, markdown, vector, etc.)
 * that sync with the YJS document and provide different query patterns.
 */
export type WorkspaceIndexMap<TWorkspaceSchema extends WorkspaceSchema = WorkspaceSchema> = Record<
	string,
	Index<TWorkspaceSchema>
>;

/**
 * Context passed to index factory functions
 */
export type IndexContext<TWorkspaceSchema extends WorkspaceSchema = WorkspaceSchema> = {
	/**
	 * The Epicenter database object with high-level CRUD methods
	 * Use methods like getAllRows(), getRow(), etc. instead of raw YJS access
	 * Table schemas are available via db.schema
	 * Workspace ID is available via db.ydoc.guid
	 */
	db: Db<TWorkspaceSchema>;
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
	TWorkspaceSchema extends WorkspaceSchema,
	TQueries = Record<string, any>,
>(index: Index<TWorkspaceSchema, TQueries>): Index<TWorkspaceSchema, TQueries> {
	return index;
}

