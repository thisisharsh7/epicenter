import type { Db } from '../db/core';
import type { WorkspaceSchema } from './schema';

/**
 * Index type system for vault.
 * Indexes are synchronized snapshots of YJS data optimized for specific query patterns.
 */

/**
 * A collection of workspace indexes indexed by index name.
 *
 * Each workspace can have multiple indexes (SQLite, markdown, vector, etc.)
 * that sync with the YJS document and provide different access patterns to the data.
 */
export type WorkspaceIndexMap = Record<string, Index<WorkspaceSchema>>;

/**
 * A collection of index exports indexed by export name.
 *
 * Index exports provide access to the synchronized snapshot data and can include
 * database instances, query functions, table references, or any other tools needed
 * to interact with the indexed data.
 */
type WorkspaceIndexExportsMap = Record<string, any>;

/**
 * Index object with initialization function
 *
 * Indexes are objects with an `init` function that sets up observers and returns
 * a cleanup function (`Symbol.dispose`) alongside any exported resources (databases, queries, etc.)
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
 *     // Return cleanup function and exported resources (all at top level)
 *     return {
 *       [Symbol.dispose]() {
 *         unsubPosts();
 *         cleanupIndex();
 *       },
 *       db: sqliteDb,
 *       search: (query: string) => { ... },
 *       getAll: () => { ... },
 *     };
 *   }
 * };
 * ```
 */
export type Index<
	TWorkspaceSchema extends WorkspaceSchema = WorkspaceSchema,
	TExportsMap extends WorkspaceIndexExportsMap = WorkspaceIndexExportsMap,
> = {
	init: (db: Db<TWorkspaceSchema>) => {
		[Symbol.dispose]: () => void;
	} & TExportsMap;
};

/**
 * Define an index with type safety
 *
 * @example
 * ```typescript
 * const sqliteIndex = defineIndex({
 *   init: (db) => ({
 *     [Symbol.dispose]: () => { ... },
 *     db: sqliteDb,
 *     findById: async (id: string) => { ... }
 *   })
 * })
 * ```
 */
export function defineIndex<
	TWorkspaceSchema extends WorkspaceSchema,
	TExportsMap extends WorkspaceIndexExportsMap = WorkspaceIndexExportsMap,
>(index: Index<TWorkspaceSchema, TExportsMap>): Index<TWorkspaceSchema, TExportsMap> {
	return index;
}

