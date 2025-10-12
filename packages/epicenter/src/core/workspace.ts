import type * as Y from 'yjs';
import type { Db } from '../db/core';
import type { WorkspaceActionMap } from './actions';
import type { WorkspaceSchema } from './schema';
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
 * db.tables.posts.set({ id: '1', title: 'Hello' });
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
 *   version: '1',
 *   name: 'blog', // Human-readable name for API access
 *
 *   schema: {
 *     posts: {
 *       // id is auto-included, no need to specify
 *       title: text(),
 *       content: yxmlfragment({ nullable: true }),
 *       category: select({ options: ['tech', 'personal'] }),
 *       views: integer({ default: 0 }),
 *     }
 *   },
 *
 *   indexes: [
 *     sqliteIndex({ databaseUrl: ':memory:' }),
 *     markdownIndex({ storagePath: './data' }),
 *   ],
 *
 *   setupYDoc: (ydoc) => {
 *     // Optional: Set up persistence
 *     new IndexeddbPersistence('blog', ydoc);
 *     return ydoc;
 *   },
 *
 *   actions: ({ db, indexes }) => ({
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
 *         db.tables.posts.set(post);
 *         return post;
 *       }
 *     })
 *   }),
 * });
 * ```
 */
export function defineWorkspace<
	const TId extends string,
	const TVersion extends string,
	const TWorkspaceSchema extends WorkspaceSchema,
	const TIndexes extends Record<string, Index<TWorkspaceSchema>>,
	const TActionMap extends WorkspaceActionMap,
	const TName extends string,
	const TDeps extends readonly WorkspaceConfig[] = readonly [],
>(
	workspace: WorkspaceConfig<
		TId,
		TVersion,
		TWorkspaceSchema,
		TActionMap,
		TIndexes,
		TName,
		TDeps
	>,
): WorkspaceConfig<TId, TVersion, TWorkspaceSchema, TActionMap, TIndexes, TName, TDeps> {
	// Validate workspace ID
	if (!workspace.id || typeof workspace.id !== 'string') {
		throw new Error('Workspace must have a valid string ID');
	}

	// Validate workspace version
	if (!workspace.version || typeof workspace.version !== 'string') {
		throw new Error('Workspace must have a valid string version');
	}

	// Validate workspace name
	if (!workspace.name || typeof workspace.name !== 'string') {
		throw new Error('Workspace must have a valid string name');
	}

	// Validate dependencies
	if (workspace.dependencies) {
		if (!Array.isArray(workspace.dependencies)) {
			throw new Error('Dependencies must be an array of workspace configs');
		}

		for (const dep of workspace.dependencies as readonly WorkspaceConfig[]) {
			if (!dep || typeof dep !== 'object' || !dep.id) {
				throw new Error(
					'Invalid dependency: dependencies must be workspace configs with id',
				);
			}
		}
	}

	return workspace;
}

/**
 * Workspace configuration definition
 */
export type WorkspaceConfig<
	TId extends string = string,
	TVersion extends string = string,
	TWorkspaceSchema extends WorkspaceSchema = WorkspaceSchema,
	TActionMap extends WorkspaceActionMap = WorkspaceActionMap,
	TIndexes extends Record<string, Index<TWorkspaceSchema>> = Record<string, Index<TWorkspaceSchema>>,
	TName extends string = string,
	TDeps extends readonly WorkspaceConfig[] = readonly [],
> = {
	/**
	 * Unique identifier for this workspace (base ID without version)
	 * Used to group different versions of the same workspace
	 *
	 * @example 'blog', 'auth', 'storage'
	 */
	id: TId;

	/**
	 * Version of this workspace
	 * Combined with ID to create Y.Doc GUID: `${id}.${version}`
	 * Allows multiple versions of the same workspace to coexist
	 *
	 * @example '1', '2', '1.0.0', '2.0.0'
	 */
	version: TVersion;

	/**
	 * Human-readable name for this workspace
	 * Used as the property name when accessing workspace actions from dependencies
	 * This is what you use in code: workspaces.myWorkspace.action()
	 *
	 * @example 'blog', 'auth', 'storage'
	 */
	name: TName;

	/**
	 * Table schemas (column definitions as JSON)
	 */
	schema: TWorkspaceSchema;

	/**
	 * Other workspaces this workspace depends on
	 * Names become the property names in the workspaces API
	 * @example
	 * ```typescript
	 * dependencies: [authWorkspace, storageWorkspace]
	 * // Later in actions (using workspace names as property names):
	 * workspaces.auth.login(...)
	 * workspaces.storage.uploadFile(...)
	 * ```
	 */
	dependencies?: TDeps;

	/**
	 * Indexes definition - creates synchronized snapshots for querying
	 * Factory function that receives database context and returns index objects
	 *
	 * @example
	 * ```typescript
	 * indexes: ({ db }) => ({
	 *   sqlite: sqliteIndex({ db, databaseUrl: ':memory:' }),
	 *   markdown: markdownIndex({ db, storagePath: './data' }),
	 * })
	 * ```
	 */
	indexes: (context: { db: Db<TWorkspaceSchema> }) => TIndexes;

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
	 * Workspace actions - business logic with access to db, indexes, and dependency workspaces
	 * @param context - Database instance (with tables, ydoc, transactions), indexes (read), and dependency workspaces
	 * @returns Map of action name → action implementation
	 *
	 * @example
	 * ```typescript
	 * actions: ({ db, indexes, workspaces }) => ({
	 *   createPost: defineMutation({
	 *     input: z.object({ title: z.string() }),
	 *     handler: async ({ title }) => {
	 *       const post = { id: generateId(), title, ... };
	 *       db.tables.posts.set(post);
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
	actions: (context: WorkspaceActionContext<TWorkspaceSchema, TIndexes, TDeps>) => TActionMap;
};

/**
 * Context passed to the actions function
 */
export type WorkspaceActionContext<
	TWorkspaceSchema extends WorkspaceSchema = WorkspaceSchema,
	TIndexes extends Record<string, Index<TWorkspaceSchema>> = Record<string, Index<TWorkspaceSchema>>,
	TDeps extends readonly WorkspaceConfig[] = readonly [],
> = {
	/**
	 * Dependency workspaces
	 * Access actions from other workspaces
	 */
	workspaces: DependencyWorkspacesAPI<TDeps>;

	/**
	 * Database instance with table helpers, ydoc, schema, and utilities
	 * Provides full access to YJS document and transactional operations
	 */
	db: Db<TWorkspaceSchema>;

	/**
	 * Indexes for this workspace
	 * Async read operations (select, search, etc.)
	 */
	indexes: IndexesAPI<TIndexes>;
};

/**
 * Indexes API - extracts only the queries from indexes
 * Converts record of indexes to record of queries keyed by same keys
 */
export type IndexesAPI<TIndexes extends Record<string, Index<any>>> = {
	[K in keyof TIndexes]: TIndexes[K] extends Index<any, infer TQueries>
		? TQueries
		: never;
};

/**
 * Dependency workspaces API - actions from dependency workspaces
 * Converts array of workspaces into an object keyed by workspace names
 */
type DependencyWorkspacesAPI<TDeps extends readonly WorkspaceConfig[]> =
	TDeps extends readonly []
		? Record<string, never>
		: {
				[W in TDeps[number] as W extends WorkspaceConfig<
					infer _,
					infer _,
					infer _,
					infer _,
					infer _,
					infer TName
				>
					? TName
					: never]: W extends WorkspaceConfig<
					infer _,
					infer _,
					infer _,
					infer TActionMap,
					infer _,
					infer _,
					infer _
				>
					? ExtractHandlers<TActionMap>
					: never;
			};

/**
 * Extract handler functions from action map
 */
export type ExtractHandlers<T extends WorkspaceActionMap> = {
	[K in keyof T]: T[K]['handler'];
};

/**
 * Extract handlers from a workspace action map at runtime
 * Converts action objects to their handler functions
 *
 * @param actionMap - Map of action name to action object
 * @returns Map of action name to handler function
 */
export function extractHandlers<T extends WorkspaceActionMap>(
	actionMap: T,
): ExtractHandlers<T> {
	return Object.fromEntries(
		Object.entries(actionMap).map(([actionName, action]) => [
			actionName,
			action.handler,
		]),
	) as ExtractHandlers<T>;
}
