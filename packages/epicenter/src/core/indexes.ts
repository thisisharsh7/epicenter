import type { Db } from '../db/core';
import type { WorkspaceSchema } from './schema';

/**
 * Factory function type that creates a WorkspaceIndexMap for a given workspace schema.
 * Takes a database context and returns a map of indexes.
 *
 * The second generic parameter captures the specific return type so it can flow into
 * the actions context with full type information.
 *
 * @example
 * ```typescript
 * const createIndexes: WorkspaceIndexMapConstructor<MySchema, MyIndexMap> = ({ db }) => ({
 *   sqlite: sqliteIndex(db, { databaseUrl: ':memory:' }),
 *   markdown: markdownIndex(db, { storagePath: './data' }),
 * });
 * ```
 */
export type WorkspaceIndexMapConstructor<
	TWorkspaceSchema extends WorkspaceSchema,
	TIndexMap extends WorkspaceIndexMap = WorkspaceIndexMap,
> = (context: { db: Db<TWorkspaceSchema> }) => TIndexMap;

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
export type WorkspaceIndexMap = Record<string, Index>;

/**
 * Index type - an object with cleanup function and any exported resources
 *
 * Indexes set up observers on YJS documents and export resources like:
 * - Database instances (SQLite, etc.)
 * - Query functions
 * - Table references
 * - Any other tools needed to interact with the indexed data
 *
 * All indexes must include Symbol.dispose for cleanup.
 *
 * @example
 * ```typescript
 * function sqliteIndex(db, config): Index<{ db: Database, posts: Table }> {
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
 *   // Return cleanup function and exported resources
 *   return {
 *     [Symbol.dispose]() {
 *       unsubPosts();
 *       cleanupIndex();
 *     },
 *     db: sqliteDb,
 *     posts: postsTable,
 *   };
 * }
 * ```
 */
export type Index<TExports = {}> = {
	[Symbol.dispose]: () => void;
} & TExports;

/**
 * Define an index with type safety (identity function)
 *
 * @example
 * ```typescript
 * const sqliteIndex = defineIndex({
 *   [Symbol.dispose]: () => { ... },
 *   db: sqliteDb,
 *   findById: async (id: string) => { ... }
 * })
 * ```
 */
export function defineIndex<TExports = {}>(index: Index<TExports>): Index<TExports> {
	return index;
}

