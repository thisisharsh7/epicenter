import * as Y from 'yjs';
import type { TableHelper } from '../db/core';
import type { WorkspaceActionMap } from './actions';
import type { TableSchema, ValidatedRow } from './column-schemas';
import type { Index } from './indexes';

/**
 * Define a collaborative workspace with YJS-first architecture.
 *
 * ## Workspace Structure
 *
 * Each workspace is a self-contained module with:
 * - **tables**: Column schemas (pure JSON, no Drizzle)
 * - **indexes**: Synchronized snapshots for querying (SQLite, markdown, vector, etc.)
 * - **actions**: Business logic with access to tables and indexes
 *
 * ## Data Flow
 *
 * **Writes**: Go to YJS document → auto-sync to all indexes
 * ```typescript
 * tables.posts.set({ id: '1', title: 'Hello' });
 * // YJS updated → SQLite synced → Markdown synced → Vector synced
 * ```
 *
 * **Reads**: Query indexes directly
 * ```typescript
 * await indexes.sqlite.posts.select().where(...).all();
 * await indexes.vector.search('semantic query');
 * ```
 *
 * @example
 * ```typescript
 * const blogWorkspace = defineWorkspace({
 *   id: 'blog',
 *
 *   schema: {
 *     posts: {
 *       id: id(),
 *       title: text(),
 *       content: richText({ nullable: true }),
 *       category: select({ options: ['tech', 'personal'] }),
 *       views: integer({ default: 0 }),
 *     }
 *   },
 *
 *   indexes: [
 *     createSQLiteIndex({ databaseUrl: ':memory:' }),
 *     createMarkdownIndex({ storagePath: './data' }),
 *   ],
 *
 *   setupYDoc: (ydoc) => {
 *     // Optional: Set up persistence
 *     new IndexeddbPersistence('blog', ydoc);
 *     return ydoc;
 *   },
 *
 *   actions: ({ tables, indexes }) => ({
 *     getPublishedPosts: defineQuery({
 *       input: z.void(),
 *       handler: async () => {
 *         return indexes.sqlite.posts
 *           .select()
 *           .where(isNotNull(indexes.sqlite.posts.publishedAt))
 *           .all();
 *       }
 *     }),
 *
 *     createPost: defineMutation({
 *       input: z.object({ title: z.string() }),
 *       handler: async ({ title }) => {
 *         const post = {
 *           id: generateId(),
 *           title,
 *           content: null,
 *           category: 'tech',
 *           views: 0,
 *         };
 *         tables.posts.set(post);
 *         return post;
 *       }
 *     })
 *   }),
 * });
 * ```
 */
export function defineWorkspace<const W extends Workspace>(workspace: W): W {
	// Validate workspace ID
	if (!workspace.id || typeof workspace.id !== 'string') {
		throw new Error('Workspace must have a valid string ID');
	}

	return workspace;
}

/**
 * Workspace definition
 */
export type Workspace<
	TId extends string = string,
	TSchema extends Record<string, TableSchema> = Record<string, TableSchema>,
	TActionMap extends WorkspaceActionMap = WorkspaceActionMap,
	TIndexes extends readonly Index<TSchema>[] = readonly Index<TSchema>[],
> = {
	/**
	 * Unique identifier for this workspace
	 * Also used as the GUID for the YJS document
	 */
	id: TId;

	/**
	 * Table schemas (column definitions as JSON)
	 */
	schema: TSchema;

	/**
	 * Indexes definition - creates synchronized snapshots for querying
	 * Readonly array of index objects with unique IDs
	 *
	 * @example
	 * ```typescript
	 * indexes: [
	 *   createSQLiteIndex({ databaseUrl: ':memory:' }),
	 *   createMarkdownIndex({ storagePath: './data' }),
	 * ]
	 * ```
	 */
	indexes: TIndexes;

	/**
	 * Optional function to set up YDoc synchronization and persistence
	 * Called after indexes are registered with the YDoc instance
	 * Use this to register IndexedDB persistence, remote sync providers, etc.
	 *
	 * @param ydoc - The YJS document for this workspace
	 * @returns The YDoc (for chaining)
	 *
	 * @example
	 * ```typescript
	 * setupYDoc: (ydoc) => {
	 *   // Set up IndexedDB persistence
	 *   new IndexeddbPersistence('my-workspace', ydoc);
	 *
	 *   // Set up WebRTC provider for collaboration
	 *   new WebrtcProvider('my-workspace', ydoc);
	 *
	 *   return ydoc;
	 * }
	 * ```
	 */
	setupYDoc?: (ydoc: Y.Doc) => Y.Doc;

	/**
	 * Workspace actions - business logic with access to tables and indexes
	 * @param context - Tables (write) and indexes (read)
	 * @returns Map of action name → action implementation
	 *
	 * @example
	 * ```typescript
	 * actions: ({ tables, indexes }) => ({
	 *   createPost: defineMutation({
	 *     input: z.object({ title: z.string() }),
	 *     handler: async ({ title }) => {
	 *       const post = { id: generateId(), title, ... };
	 *       tables.posts.set(post);
	 *       return post;
	 *     }
	 *   }),
	 *   getPublishedPosts: defineQuery({
	 *     input: z.void(),
	 *     handler: async () => {
	 *       return indexes.sqlite.posts.select().where(...).all();
	 *     }
	 *   })
	 * })
	 * ```
	 */
	actions: (
		context: WorkspaceActionContext<TSchema, TIndexes>,
	) => TActionMap;
};

/**
 * Context passed to the actions function
 */
export type WorkspaceActionContext<
	TSchema extends Record<string, TableSchema> = Record<string, TableSchema>,
	TIndexes extends readonly Index<TSchema>[] = readonly Index<TSchema>[],
> = {
	/**
	 * Table helpers for this workspace
	 * Synchronous write/read operations to YJS
	 */
	tables: {
		[TableName in keyof TSchema]: TableHelper<ValidatedRow<TSchema[TableName]>>;
	};

	/**
	 * Indexes for this workspace
	 * Async read operations (select, search, etc.)
	 */
	indexes: IndexesAPI<TIndexes>;
};

/**
 * Indexes API - extracts only the queries from indexes
 * Converts readonly array of indexes to record keyed by ID
 */
export type IndexesAPI<TIndexes extends readonly Index<any>[]> = {
	[K in TIndexes[number] as K['id']]: K extends Index<any, any, infer TQueries>
		? TQueries
		: never;
};
