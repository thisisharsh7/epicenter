/**
 * Index type system for vault.
 * Indexes are synchronized snapshots of YJS data optimized for specific query patterns.
 */

import type { Db } from './db/core';
import type { WorkspaceSchema } from './schema';

/**
 * Index function type - receives IndexContext and returns IndexExports.
 *
 * An index is a function that sets up synchronization between YJS and some external storage
 * or query interface (SQLite, markdown files, vector database, etc.).
 *
 * Consistent with the Provider pattern, the function itself is called an "Index".
 *
 * @example
 * ```typescript
 * // Simple synchronous index
 * const myIndex: Index<MySchema, MyExports> = ({ id, db }) => {
 *   return defineIndex({
 *     destroy: () => { },
 *     // ... other exports
 *   });
 * };
 *
 * // Async index
 * const myAsyncIndex: Index<MySchema, MyExports> = async ({ id, db }) => {
 *   await setupSomething();
 *   return defineIndex({
 *     destroy: () => { },
 *     // ... other exports
 *   });
 * };
 * ```
 */
export type Index<
	TSchema extends WorkspaceSchema = WorkspaceSchema,
	TExports extends IndexExports = IndexExports,
> = (context: IndexContext<TSchema>) => TExports | Promise<TExports>;

/**
 * Context provided to each index factory function.
 *
 * Provides workspace metadata and database instance that indexes sync with.
 *
 * @property id - The workspace ID (e.g., 'blog', 'content-hub')
 * @property db - The Epicenter database instance containing YJS-backed tables
 *
 * @example Creating an index with IndexContext
 * ```typescript
 * export function sqliteIndex<TSchema extends WorkspaceSchema>(
 *   { id, db }: IndexContext<TSchema>
 * ) {
 *   // Use id for file naming: `.epicenter/${id}.db`
 *   // Use db to observe table changes
 * }
 * ```
 */
export type IndexContext<TSchema extends WorkspaceSchema = WorkspaceSchema> = {
	id: string;
	db: Db<TSchema>;
};

/**
 * Index exports type - an object with cleanup function and any exported resources
 *
 * Indexes set up observers on YJS documents and export resources like:
 * - Database instances (SQLite, etc.)
 * - Query functions
 * - Table references
 * - Any other tools needed to interact with the indexed data
 *
 * All indexes must include destroy() for cleanup.
 *
 * You can export anything from an index and it will be fully typed in the actions context.
 * This pattern allows indexes to expose queryable interfaces, helper functions, or any
 * other resources needed by your actions.
 *
 * @example
 * ```typescript
 * // Creating an index - internal resources become exports
 * function sqliteIndex({ id, db }: IndexContext) {
 *   // 1. Create internal resources
 *   const sqliteDb = drizzle({ client, schema: drizzleTables });
 *   const drizzleTables = convertWorkspaceSchemaToDrizzle(db.schema);
 *
 *   // 2. Set up YJS observers
 *   const unsubPosts = db.tables.posts.observe({
 *     onAdd: (row) => { indexPost(row); },
 *     onUpdate: (row) => { reindexPost(row); },
 *     onDelete: (id) => { removePost(id); },
 *   });
 *
 *   // 3. Export resources via defineIndex()
 *   return defineIndex({
 *     destroy() {
 *       unsubPosts();
 *       cleanupIndex();
 *     },
 *     db: sqliteDb,        // Exported as indexes.sqlite.db
 *     posts: postsTable,   // Exported as indexes.sqlite.posts
 *   });
 * }
 *
 * // Using exported resources in actions
 * const workspace = defineWorkspace({
 *   indexes: {
 *     sqlite: sqliteIndex,
 *   },
 *
 *   actions: ({ indexes }) => ({
 *     getPost: defineQuery({
 *       handler: async ({ id }) => {
 *         // All exported properties are fully typed and available here
 *         return await indexes.sqlite.db
 *           .select()
 *           .from(indexes.sqlite.posts)
 *           .where(eq(indexes.sqlite.posts.id, id));
 *       }
 *     })
 *   })
 * });
 * ```
 */
export type IndexExports = {
	destroy: () => void;
};

/**
 * A collection of workspace indexes indexed by index name.
 *
 * Each workspace can have multiple indexes (SQLite, markdown, vector, etc.)
 * that sync with the YJS document and provide different access patterns to the data.
 */
export type WorkspaceIndexMap = Record<string, IndexExports>;

/**
 * Define index exports with type safety (identity function)
 *
 * @example
 * ```typescript
 * const sqliteIndexExports = defineIndexExports({
 *   destroy: () => { ... },
 *   db: sqliteDb,
 *   findById: async (id: string) => { ... }
 * })
 * // Type is inferred as { destroy: () => void, db: typeof sqliteDb, findById: (id: string) => Promise<...> }
 * ```
 */
export function defineIndexExports<T extends IndexExports>(exports: T): T {
	return exports;
}
