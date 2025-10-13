import type * as Y from 'yjs';
import type { Db } from '../../db/core';
import type { WorkspaceActionMap } from '../actions';
import type { WorkspaceSchema } from '../schema';
import type { Index, WorkspaceIndexMap } from '../indexes';

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
 *   version: 1,
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
 *   },
 *
 *   actions: ({ db, indexes }) => ({
 *     getPublishedPosts: defineQuery({
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
	const TVersion extends number,
	const TName extends string,
	const TWorkspaceSchema extends WorkspaceSchema,
	const TDeps extends readonly ShallowWorkspaceConfig[], // ← Changed to ShallowWorkspaceConfig
	const TIndexes extends WorkspaceIndexMap<TWorkspaceSchema>,
	const TActionMap extends WorkspaceActionMap,
>(
	workspace: WorkspaceConfig<
		TId,
		TVersion,
		TName,
		TWorkspaceSchema,
		TDeps,
		TIndexes,
		TActionMap
	>,
): WorkspaceConfig<TId, TVersion, TName, TWorkspaceSchema, TDeps, TIndexes, TActionMap> {
	// Validate workspace ID
	if (!workspace.id || typeof workspace.id !== 'string') {
		throw new Error('Workspace must have a valid string ID');
	}

	// Validate workspace version
	if (!workspace.version || typeof workspace.version !== 'number') {
		throw new Error('Workspace must have a valid number version');
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

		for (const dep of workspace.dependencies) {
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
	TVersion extends number = number,
	TName extends string = string,
	TWorkspaceSchema extends WorkspaceSchema = WorkspaceSchema,
	TDeps extends readonly ShallowWorkspaceConfig[] = readonly ShallowWorkspaceConfig[], // ← Changed to ShallowWorkspaceConfig
	TIndexes extends WorkspaceIndexMap<TWorkspaceSchema> = WorkspaceIndexMap<TWorkspaceSchema>,
	TActionMap extends WorkspaceActionMap = WorkspaceActionMap,
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
	 *
	 * When multiple workspaces with the same ID are registered, only the highest
	 * version is kept. Increment the version whenever you change the schema or
	 * actions, as these are breaking changes to the API surface.
	 *
	 * @example 1, 2, 3, 4
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
	 *
	 * @example
	 * ```typescript
	 * setupYDoc: (ydoc) => {
	 *   // Set up IndexedDB persistence
	 *   new IndexeddbPersistence('my-workspace', ydoc);
	 *
	 *   // Set up WebRTC provider for collaboration
	 *   new WebrtcProvider('my-workspace', ydoc);
	 * }
	 * ```
	 */
	setupYDoc?: (ydoc: Y.Doc) => void;

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
	actions: (context: {
		/** Database instance with table helpers, ydoc, schema, and utilities */
		db: Db<TWorkspaceSchema>;
		/** Dependency workspaces - access actions from other workspaces */
		workspaces: DependencyWorkspacesAPI<TDeps>;
		/** Indexes for this workspace - async read operations (select, search, etc.) */
		indexes: IndexesAPI<TIndexes>;
	}) => TActionMap;
};

/**
 * Shallow workspace config - used as the constraint for dependencies.
 *
 * This type prevents recursive type inference by omitting the nested dependencies field.
 * When you define a workspace with dependencies: [workspaceA, workspaceB], TypeScript
 * only needs to infer the properties of A and B themselves, not their dependencies.
 *
 * This solves two problems:
 * 1. Prevents deep recursive type inference that slows down TypeScript
 * 2. Stops TypeScript from trying to validate the entire dependency tree
 *
 * @example
 * ```typescript
 * const workspaceB = defineWorkspace({
 *   dependencies: [workspaceA],  // ← TypeScript infers workspaceA as ShallowWorkspaceConfig
 *   // ...
 * });
 * ```
 */
export type ShallowWorkspaceConfig = {
	id: string;
	version: number;
	name: string;
	schema: WorkspaceSchema;
	indexes: (context: { db: Db<any> }) => WorkspaceIndexMap<any>;
	setupYDoc?: (ydoc: Y.Doc) => void;
	actions: (context: {
		db: Db<any>;
		workspaces: any;
		indexes: any;
	}) => WorkspaceActionMap;
	// NOTE: No dependencies field - this prevents recursive type inference
};

/**
 * Represents any workspace, regardless of its specific types.
 *
 * This is the "wide" type used at runtime in createWorkspaceClient().
 * It's permissive and accepts any valid workspace structure, allowing
 * the runtime to handle complex dependency graphs.
 *
 * Note: Uses ShallowWorkspaceConfig[] for dependencies (not any[]) to maintain
 * compatibility with WorkspaceConfig returned by defineWorkspace().
 */
export type AnyWorkspaceConfig = WorkspaceConfig<
	string,
	number,
	string,
	any, // ← Permissive for schema
	readonly ShallowWorkspaceConfig[], // ← Use ShallowWorkspaceConfig for compatibility
	any, // ← Permissive for indexes
	any // ← Permissive for actions
>;

/**
 * Dependency workspaces API - actions from dependency workspaces
 * Converts array of workspaces into an object keyed by workspace names
 *
 * Extracts only the necessary information (name and actions) from dependencies
 * without recursively inferring their nested dependency types.
 */
export type DependencyWorkspacesAPI<TDeps extends readonly ShallowWorkspaceConfig[]> =
	TDeps extends readonly []
		? Record<string, never>
		: {
				[W in TDeps[number] as W extends { name: infer TName extends string }
					? TName
					: never]: W extends {
					actions: (context: any) => infer TActionMap extends WorkspaceActionMap;
				}
					? ExtractHandlers<TActionMap>
					: never;
			};

/**
 * Indexes API - extracts only the queries from indexes
 * Converts record of indexes to record of queries keyed by same keys
 */
export type IndexesAPI<TIndexes extends WorkspaceIndexMap<any>> = {
	[K in keyof TIndexes]: TIndexes[K] extends Index<any, infer TQueries>
		? TQueries
		: never;
};

/**
 * Extract handler functions from action map
 */
export type ExtractHandlers<T extends WorkspaceActionMap> = {
	[K in keyof T]: T[K]['handler'];
};
