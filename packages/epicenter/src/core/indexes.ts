
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
 * All indexes must include destroy() for cleanup.
 *
 * You can export anything from an index and it will be fully typed in the actions context.
 * This pattern allows indexes to expose queryable interfaces, helper functions, or any
 * other resources needed by your actions.
 *
 * @example
 * ```typescript
 * // Creating an index - internal resources become exports
 * function sqliteIndex(db, config) {
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
 *   indexes: async ({ db }) => ({
 *     sqlite: await sqliteIndex(db, { database: 'app.db' }),
 *   }),
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
export type Index = {
	destroy: () => void;
};

/**
 * Define an index with type safety (identity function)
 *
 * @example
 * ```typescript
 * const sqliteIndex = defineIndex({
 *   destroy: () => { ... },
 *   db: sqliteDb,
 *   findById: async (id: string) => { ... }
 * })
 * // Type is inferred as { destroy: () => void, db: typeof sqliteDb, findById: (id: string) => Promise<...> }
 * ```
 */
export function defineIndex<T extends Index>(index: T): T {
	return index;
}

