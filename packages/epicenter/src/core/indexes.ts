import type { createEpicenterDb } from '../db/core';
import type { TableSchema } from './column-schemas';

/**
 * Index type system for vault.
 * Indexes are synchronized snapshots of YJS data optimized for specific query patterns.
 */

/**
 * Index function that sets up observers and returns cleanup function + queries
 *
 * Indexes are lazy functions that:
 * 1. Take the db object as parameter
 * 2. Register observers using db.tables.X.observe()
 * 3. Perform any initialization logic
 * 4. Return an object with destroy function and query methods
 *
 * @example
 * ```typescript
 * function myIndex(db: ReturnType<typeof createEpicenterDb<MySchema>>) {
 *   // Register observers
 *   const unsubPosts = db.tables.posts.observe({
 *     onAdd: (row) => { indexPost(row); },
 *     onUpdate: (row) => { reindexPost(row); },
 *     onDelete: (id) => { removePost(id); },
 *   });
 *
 *   // Initialization
 *   initializeIndex();
 *
 *   // Return cleanup function and query methods
 *   return {
 *     destroy() {
 *       unsubPosts();
 *       cleanupIndex();
 *     },
 *     queries: {
 *       search: (query: string) => { ... },
 *       getAll: () => { ... },
 *     },
 *   };
 * }
 * ```
 */
export type Index<
	TSchema extends Record<string, TableSchema> = Record<string, TableSchema>,
	TQueries = Record<string, any>,
> = (db: ReturnType<typeof createEpicenterDb<TSchema>>) => {
	destroy: () => void | Promise<void>;
	queries: TQueries;
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
	db: ReturnType<typeof createEpicenterDb<TSchema>>;
};
