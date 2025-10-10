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
 * const ydoc = new Y.Doc({ guid: 'blog-uuid' });
 *
 * const blogWorkspace = defineWorkspace({
 *   id: 'blog',
 *   ydoc,
 *
 *   schema: {
 *     posts: {
 *       id: id(),
 *       title: text(),
 *       content: richText({ nullable: true }),
 *       category: select({ options: ['tech', 'personal'] as const }),
 *       views: integer({ default: 0 }),
 *     }
 *   },
 *
 *   indexes: [
 *     createSQLiteIndex({ databaseUrl: ':memory:' }),
 *     createMarkdownIndex({ storagePath: './data' }),
 *   ] as const,
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
export function defineWorkspace<W extends Workspace>(workspace: W): W {
	// Validate workspace ID
	if (!workspace.id || typeof workspace.id !== 'string') {
		throw new Error('Workspace must have a valid string ID');
	}

	// Validate YJS document
	if (!workspace.ydoc || !(workspace.ydoc instanceof Y.Doc)) {
		throw new Error('Workspace must have a valid YJS document (ydoc)');
	}

	// Validate dependencies
	if (workspace.dependencies) {
		if (!Array.isArray(workspace.dependencies)) {
			throw new Error('Dependencies must be an array of workspace objects');
		}

		for (const dep of workspace.dependencies as readonly Workspace[]) {
			if (!dep || typeof dep !== 'object' || !dep.id || !dep.ydoc) {
				throw new Error(
					'Invalid dependency: dependencies must be workspace objects with id and ydoc',
				);
			}
		}
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
	TDeps extends readonly Workspace[] = readonly [],
> = {
	/**
	 * Unique identifier for this workspace
	 * Used as the property name when accessing workspace actions from dependencies
	 */
	id: TId;

	/**
	 * YJS document for this workspace
	 * Must have a unique GUID set
	 */
	ydoc: Y.Doc;

	/**
	 * Table schemas (column definitions as JSON)
	 */
	schema: TSchema;

	/**
	 * Other workspaces this workspace depends on
	 * IDs become the property names in the workspaces API
	 * @example
	 * ```typescript
	 * dependencies: [authWorkspace, storageWorkspace]
	 * // Later in actions (using workspace IDs as property names):
	 * workspaces.auth.login(...)
	 * workspaces.storage.uploadFile(...)
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
	 * ] as const
	 * ```
	 */
	indexes: TIndexes;

	/**
	 * Workspace actions - business logic with access to tables and indexes
	 * @param context - Tables (write), indexes (read), and dependency workspaces
	 * @returns Map of action name → action implementation
	 *
	 * @example
	 * ```typescript
	 * actions: ({ tables, indexes, workspaces }) => ({
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
	TSchema extends Record<string, TableSchema> = Record<string, TableSchema>,
	TIndexes extends readonly Index<TSchema>[] = readonly Index<TSchema>[],
	TDeps extends readonly Workspace[] = readonly [],
> = {
	/**
	 * Dependency workspaces
	 * Access actions from other workspaces
	 */
	workspaces: DependencyWorkspacesAPI<TDeps>;

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

/**
 * Dependency workspaces API - actions from dependency workspaces
 * Converts array of workspaces into an object keyed by workspace IDs
 */
type DependencyWorkspacesAPI<TDeps extends readonly Workspace[]> =
	TDeps extends readonly []
		? Record<string, never>
		: {
				[W in TDeps[number] as W extends Workspace<infer TId>
					? TId
					: never]: W extends Workspace<infer _, infer _, infer TActionMap>
					? ExtractHandlers<TActionMap>
					: never;
			};

/**
 * Extract handler functions from action map
 */
type ExtractHandlers<T extends WorkspaceActionMap> = {
	[K in keyof T]: T[K]['handler'];
};
