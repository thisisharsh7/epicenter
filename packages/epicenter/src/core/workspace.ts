import type * as Y from 'yjs';
import type { Db } from '../db/core';
import type { WorkspaceActionMap } from './actions';
import type { Schema, TableSchema } from './column-schemas';
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
 *   id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', // Unique ID (UUID/nanoid)
 *   name: 'blog', // Human-readable name for API access
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
export function defineWorkspace<const W extends WorkspaceConfig>(
	workspace: W,
): W {
	// Validate workspace ID
	if (!workspace.id || typeof workspace.id !== 'string') {
		throw new Error('Workspace must have a valid string ID');
	}

	// Validate workspace name
	if (!workspace.name || typeof workspace.name !== 'string') {
		throw new Error('Workspace must have a valid string name');
	}

	// Validate dependencies
	if (workspace.dependencies) {
		if (!Array.isArray(workspace.dependencies)) {
			throw new Error('Dependencies must be an array of workspace objects');
		}

		for (const dep of workspace.dependencies as readonly WorkspaceConfig[]) {
			if (!dep || typeof dep !== 'object' || !dep.id || !dep.name) {
				throw new Error(
					'Invalid dependency: dependencies must be workspace objects with id and name',
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
	TSchema extends Schema = Schema,
	TActionMap extends WorkspaceActionMap = WorkspaceActionMap,
	TIndexes extends readonly Index<TSchema>[] = readonly Index<TSchema>[],
	TDeps extends readonly WorkspaceConfig[] = readonly [],
	TName extends string = string,
> = {
	/**
	 * Unique internal identifier for this workspace (typically a UUID or nanoid)
	 * Used as the GUID for the YJS document to ensure uniqueness
	 * Should never conflict, even across different installations
	 */
	id: TId;

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
	schema: TSchema;

	/**
	 * Other workspaces this workspace depends on
	 * Names become the property names in the workspaces API
	 * @example
	 * ```typescript
	 * dependencies: [authWorkspace, storageWorkspace]
	 * // Later in actions (using workspace names as property names):
	 * workspaces.auth.login(...)         // 'auth' is authWorkspace.name
	 * workspaces.storage.uploadFile(...) // 'storage' is storageWorkspace.name
	 * ```
	 */
	dependencies?: TDeps;

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
	 * Workspace actions - business logic with access to db and indexes
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
	actions: (
		context: WorkspaceActionContext<TSchema, TIndexes, TDeps>,
	) => TActionMap;

	/**
	 * Lifecycle hooks (optional)
	 */
	hooks?: {
		beforeInit?: () => Promise<void>;
		afterInit?: () => Promise<void>;
	};
};

/**
 * Context passed to the actions function
 */
export type WorkspaceActionContext<
	TSchema extends Schema = Schema,
	TIndexes extends readonly Index<TSchema>[] = readonly Index<TSchema>[],
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
	db: Db<TSchema>;

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

/**
 * Dependency workspaces API - actions from dependency workspaces
 * Converts array of workspaces into an object keyed by workspace names
 */
export type DependencyWorkspacesAPI<TDeps extends readonly WorkspaceConfig[]> =
	TDeps extends readonly []
		? Record<string, never>
		: {
				[W in TDeps[number] as W extends WorkspaceConfig<
					infer _TId,
					infer _TSchema,
					infer _TActionMap,
					infer _TIndexes,
					infer _TDeps,
					infer TName
				>
					? TName
					: never]: W extends WorkspaceConfig<
					infer _TId2,
					infer _TSchema2,
					infer TActionMap
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
	return Object.entries(actionMap).reduce(
		(acc, [actionName, action]) => {
			(acc as any)[actionName] = action.handler;
			return acc;
		},
		{} as ExtractHandlers<T>,
	);
}
