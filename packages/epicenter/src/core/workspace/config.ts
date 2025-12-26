import type { Actions } from '../actions';
import type { WorkspaceBlobs } from '../blobs';
import type { Tables } from '../db/core';
import type { Provider, Providers, WorkspaceProviderMap } from '../provider';
import type { WorkspaceSchema, WorkspaceValidators } from '../schema';
import type { EpicenterDir, ProjectDir } from '../types';

/**
 * Filesystem paths available to workspace actions factory.
 *
 * Unlike `ProviderPaths`, this omits `provider` since the actions factory
 * operates at the workspace level, not the individual provider level.
 */
export type WorkspacePaths = {
	project: ProjectDir;
	epicenter: EpicenterDir;
};

/**
 * Define a collaborative workspace with YJS-first architecture.
 *
 * ## What is a Workspace?
 *
 * A workspace is a self-contained domain module that gets composed into an Epicenter.
 * When you create an Epicenter client, each workspace becomes a property on that client:
 *
 * ```typescript
 * const blogWorkspace = defineWorkspace({ id: 'blog', ... });
 * const authWorkspace = defineWorkspace({ id: 'auth', ... });
 *
 * const client = await createClient([blogWorkspace, authWorkspace]);
 *
 * // Each workspace is accessible by its id:
 * client.blog.createPost(...)  // blogWorkspace actions
 * client.auth.login(...)       // authWorkspace actions
 * ```
 *
 * ## Workspace Structure
 *
 * Each workspace is a self-contained module with:
 * - **tables**: Column schemas (pure JSON, no Drizzle)
 * - **providers**: Persistence, sync, materializers (SQLite, markdown, vector, etc.)
 * - **actions**: Queries and mutations with access to tables and providers
 *
 * ## Data Flow
 *
 * **Writes**: Go to YJS document -> auto-sync to all materializer providers
 * ```typescript
 * tables.posts.upsert({ id: '1', title: 'Hello' });
 * // YJS updated -> SQLite synced -> Markdown synced -> Vector synced
 * ```
 *
 * **Reads**: Query provider exports directly
 * ```typescript
 * await providers.sqlite.posts.select().where(...);
 * await providers.vector.search('semantic query');
 * ```
 *
 * @example
 * ```typescript
 * const blogWorkspace = defineWorkspace({
 *   id: 'blog',
 *
 *   tables: {
 *     posts: {
 *       id: id(),
 *       title: text(),
 *       content: ytext({ nullable: true }),
 *       category: select({ options: ['tech', 'personal'] }),
 *       views: integer({ default: 0 }),
 *     }
 *   },
 *
 *   providers: {
 *     persistence: setupPersistence,
 *     sqlite: sqliteProvider,
 *     markdown: markdownProvider,
 *   },
 *
 *   actions: ({ tables, providers }) => ({
 *     getPublishedPosts: defineQuery({
 *       handler: async () => {
 *         return await providers.sqlite.posts
 *           .select()
 *           .where(isNotNull(providers.sqlite.posts.publishedAt))
 *       }
 *     }),
 *
 *     createPost: defineMutation({
 *       input: type({ title: 'string' }),
 *       handler: async ({ title }) => {
 *         const post = {
 *           id: generateId(),
 *           title,
 *           content: null,
 *           category: 'tech',
 *           views: 0,
 *         };
 *         tables.posts.upsert(post);
 *         return post;
 *       }
 *     })
 *   }),
 * });
 * ```
 */
export function defineWorkspace<
	const TDeps extends readonly AnyWorkspaceConfig[],
	const TId extends string,
	TWorkspaceSchema extends WorkspaceSchema,
	const TProviderResults extends WorkspaceProviderMap,
	TActions extends Actions,
>(
	workspace: WorkspaceConfig<
		TDeps,
		TId,
		TWorkspaceSchema,
		TProviderResults,
		TActions
	>,
): WorkspaceConfig<TDeps, TId, TWorkspaceSchema, TProviderResults, TActions> {
	if (!workspace.id || typeof workspace.id !== 'string') {
		throw new Error('Workspace must have a valid string ID');
	}

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
 * Workspace configuration.
 *
 * Fully-featured workspace configuration used for defining workspaces and their dependencies.
 *
 * ## Dependency Constraint
 *
 * The `dependencies` field uses `AnyWorkspaceConfig[]` as a minimal constraint.
 * This prevents infinite type recursion while providing type information for action access.
 *
 * By using `AnyWorkspaceConfig` (which only includes `id` and `actions`), we stop
 * recursive type inference. Without this constraint, TypeScript would try to infer
 * dependencies of dependencies infinitely, causing "Type instantiation is excessively
 * deep" errors.
 *
 * ## Runtime vs Type-level
 *
 * At runtime, all workspace configs have full properties (tables, providers, etc.).
 * The minimal constraint is purely for type inference. The flat/hoisted dependency
 * resolution ensures all workspaces are initialized correctly.
 */
export type WorkspaceConfig<
	TDeps extends readonly AnyWorkspaceConfig[] = readonly AnyWorkspaceConfig[],
	TId extends string = string,
	TWorkspaceSchema extends WorkspaceSchema = WorkspaceSchema,
	TProviderResults extends WorkspaceProviderMap = WorkspaceProviderMap,
	TActions extends Actions = Actions,
> = {
	id: TId;
	tables: TWorkspaceSchema;
	dependencies?: TDeps;
	providers: {
		[K in keyof TProviderResults]: Provider<
			TWorkspaceSchema,
			TProviderResults[K] extends Providers ? TProviderResults[K] : Providers
		>;
	};
	/**
	 * Factory function that creates workspace actions (queries and mutations).
	 *
	 * Actions are proxyable over HTTP/RPC and are exposed via the server.
	 * Everything returned from this function should be a Query or Mutation
	 * (created via defineQuery/defineMutation or from table helpers).
	 *
	 * @param context.tables - Workspace tables for direct table operations
	 * @param context.schema - Workspace schema (table definitions)
	 * @param context.validators - Schema validators for runtime validation
	 * @param context.workspaces - Actions from dependency workspaces
	 * @param context.providers - Provider-specific exports (queries, sync operations, etc.)
	 * @param context.blobs - Blob storage for binary files, namespaced by table
	 * @param context.paths - Filesystem paths (undefined in browser)
	 *
	 * @example
	 * ```typescript
	 * actions: ({ tables, providers }) => ({
	 *   // Table CRUD operations (already defined as actions)
	 *   createPost: tables.posts.upsert,
	 *   getPost: tables.posts.get,
	 *
	 *   // Custom actions
	 *   getPublishedPosts: defineQuery({
	 *     handler: async () => {
	 *       return await providers.sqlite.posts
	 *         .select()
	 *         .where(isNotNull(providers.sqlite.posts.publishedAt))
	 *     }
	 *   }),
	 * })
	 * ```
	 */
	actions: (context: {
		tables: Tables<TWorkspaceSchema>;
		schema: TWorkspaceSchema;
		validators: WorkspaceValidators<TWorkspaceSchema>;
		workspaces: WorkspacesToActions<TDeps>;
		providers: TProviderResults;
		blobs: WorkspaceBlobs<TWorkspaceSchema>;
		paths: WorkspacePaths | undefined;
	}) => TActions;
};

/**
 * Minimal workspace constraint for generic bounds.
 *
 * Uses only `id` and `actions` to prevent infinite type recursion while still
 * providing type information for dependency action access.
 *
 * @example
 * ```typescript
 * function foo<T extends readonly AnyWorkspaceConfig[]>(configs: T) { ... }
 * ```
 */
export type AnyWorkspaceConfig = {
	id: string;
	// biome-ignore lint/suspicious/noExplicitAny: Minimal constraint to prevent infinite type recursion
	actions: (context: any) => Actions;
};

/**
 * Maps workspace configs to their actions keyed by workspace id.
 *
 * Used to provide type-safe access to dependency workspace actions.
 *
 * @example
 * ```typescript
 * // Given dependencies:
 * const authWorkspace = defineWorkspace({ id: 'auth', actions: () => ({ login, logout }) });
 * const storageWorkspace = defineWorkspace({ id: 'storage', actions: () => ({ upload, download }) });
 *
 * // WorkspacesToActions<[typeof authWorkspace, typeof storageWorkspace]> produces:
 * {
 *   auth: { login: Query, logout: Mutation },
 *   storage: { upload: Mutation, download: Query }
 * }
 * ```
 */
export type WorkspacesToActions<WS extends readonly AnyWorkspaceConfig[]> = {
	[W in WS[number] as W extends { id: infer TId extends string }
		? TId
		: never]: W extends {
		// biome-ignore lint/suspicious/noExplicitAny: Extracting action return type from generic constraint
		actions: (context: any) => infer TActions extends Actions;
	}
		? TActions
		: never;
};
