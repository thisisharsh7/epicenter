import * as Y from 'yjs';
import type { TableHelper } from '../db/core';
import type { WorkspaceActionMap } from './actions';
import type { TableSchema, ValidatedRow } from './column-schemas';
import type { Index, IndexContext } from './indexes';

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
 *   ydoc,
 *
 *   tables: {
 *     posts: {
 *       id: id(),
 *       title: text(),
 *       content: richText({ nullable: true }),
 *       category: select({ options: ['tech', 'personal'] as const }),
 *       views: integer({ default: 0 }),
 *     }
 *   },
 *
 *   indexes: ({ db, tableSchemas }) => ({
 *     sqlite: createSQLiteIndex({ db, tableSchemas }),
 *     markdown: createMarkdownIndex({ db, tableSchemas, path: './data' }),
 *   }),
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
 *   })
 * });
 * ```
 */
export function defineWorkspace<W extends Workspace>(workspace: W): W {
	// Validate YJS document
	if (!workspace.ydoc || !(workspace.ydoc instanceof Y.Doc)) {
		throw new Error('Workspace must have a valid YJS document (ydoc)');
	}

	// Validate dependencies
	if (workspace.dependencies) {
		for (const [key, dep] of Object.entries(workspace.dependencies)) {
			if (!dep || typeof dep !== 'object' || !dep.ydoc) {
				throw new Error(
					`Invalid dependency "${key}": dependencies must be workspace objects with ydoc`,
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
	TTableSchemas extends Record<string, TableSchema> = Record<
		string,
		TableSchema
	>,
	TActionMap extends WorkspaceActionMap = WorkspaceActionMap,
	TDeps extends Record<string, Workspace> = Record<string, never>,
> = {
	/**
	 * YJS document for this workspace
	 * Must have a unique GUID set
	 */
	ydoc: Y.Doc;

	/**
	 * Table schemas (column definitions as JSON)
	 */
	tables: TTableSchemas;

	/**
	 * Other workspaces this workspace depends on
	 * Keys become the property names in the workspaces API
	 * @example
	 * ```typescript
	 * dependencies: {
	 *   auth: authWorkspace,
	 *   storage: storageWorkspace
	 * }
	 * // Later in actions:
	 * workspaces.auth.login(...)
	 * workspaces.storage.uploadFile(...)
	 * ```
	 */
	dependencies?: TDeps;

	/**
	 * Indexes definition - creates synchronized snapshots for querying
	 * @param context - Epicenter database, table schemas, and workspace ID
	 * @returns Map of index name → Index instance
	 *
	 * @example
	 * ```typescript
	 * indexes: ({ db, tableSchemas }) => ({
	 *   sqlite: createSQLiteIndex({ db, tableSchemas }),
	 *   markdown: createMarkdownIndex({ db, tableSchemas, path: './data' }),
	 * })
	 * ```
	 */
	indexes: (context: IndexContext) => Record<string, Index>;

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
		context: WorkspaceActionContext<TDeps, TTableSchemas>,
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
	TDeps extends Record<string, Workspace> = Record<string, Workspace>,
	TTableSchemas extends Record<string, TableSchema> = Record<
		string,
		TableSchema
	>,
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
	tables: WorkspaceTablesAPI<TTableSchemas>;

	/**
	 * Indexes for this workspace
	 * Async read operations (select, search, etc.)
	 */
	indexes: Record<string, Index>;
};

/**
 * Table helper API - synchronous operations to YJS
 * All operations are synchronous since YJS operations are synchronous
 */
export type WorkspaceTablesAPI<
	TTableSchemas extends Record<string, TableSchema>,
> = {
	[TableName in keyof TTableSchemas]: TableHelper<
		ValidatedRow<TTableSchemas[TableName]>
	>;
};

/**
 * Dependency workspaces API - actions from dependency workspaces
 */
type DependencyWorkspacesAPI<TDeps extends Record<string, Workspace>> = {
	[K in keyof TDeps]: TDeps[K] extends Workspace<infer _, infer TActionMap>
		? ExtractHandlers<TActionMap>
		: never;
};

/**
 * Extract handler functions from action map
 */
type ExtractHandlers<T extends WorkspaceActionMap> = {
	[K in keyof T]: T[K]['handler'];
};
