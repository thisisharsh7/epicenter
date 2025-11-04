import type * as Y from 'yjs';
import type { Db } from '../../db/core';
import type { WorkspaceActionMap } from '../actions';
import type { Index, WorkspaceIndexMap } from '../indexes';
import type { WorkspaceSchema } from '../schema';

/**
 * Context provided to each YJS provider function.
 *
 * Provides workspace metadata and the YJS document that providers attach to.
 *
 * @property id - The workspace ID (e.g., 'blog', 'content-hub')
 * @property ydoc - The YJS document that providers attach to
 *
 * @example Using workspace ID in a provider
 * ```typescript
 * const myProvider: Provider = ({ id, ydoc }) => {
 *   console.log(`Setting up provider for workspace: ${id}`);
 *   // Use id for file naming, logging, etc.
 * };
 * ```
 */
export type ProviderContext = {
	id: string;
	ydoc: Y.Doc;
};

/**
 * A YJS provider function that attaches external capabilities to a YDoc.
 *
 * Providers can be:
 * - **Persistence**: Save/load YDoc state (filesystem, IndexedDB)
 * - **Synchronization**: Real-time collaboration (WebSocket, WebRTC)
 * - **Observability**: Logging, debugging, analytics
 *
 * Providers can be synchronous or asynchronous. Async providers are awaited during workspace initialization.
 *
 * @example Persistence provider
 * ```typescript
 * const persistenceProvider: Provider = ({ ydoc }) => {
 *   new IndexeddbPersistence('my-db', ydoc);
 * };
 * ```
 *
 * @example Sync provider
 * ```typescript
 * const syncProvider: Provider = ({ ydoc }) => {
 *   new WebsocketProvider('ws://localhost:1234', 'my-room', ydoc);
 * };
 * ```
 */
export type Provider = (context: ProviderContext) => void | Promise<void>;

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
 * const epicenter = await createEpicenterClient({
 *   workspaces: [blogWorkspace, authWorkspace]
 * });
 *
 * // Each workspace is accessible by its id:
 * epicenter.blog.createPost(...)  // blogWorkspace actions
 * epicenter.auth.login(...)       // authWorkspace actions
 * ```
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
 * await indexes.sqlite.posts.select().where(...);
 * await indexes.vector.search('semantic query');
 * ```
 *
 * @example
 * ```typescript
 * const blogWorkspace = defineWorkspace({
 *   id: 'blog',
 *   version: 1,
 *
 *   schema: {
 *     posts: {
 *       // id is auto-included, no need to specify
 *       title: text(),
 *       content: ytext({ nullable: true }),
 *       category: select({ options: ['tech', 'personal'] }),
 *       views: integer({ default: 0 }),
 *     }
 *   },
 *
 *   indexes: {
 *     sqlite: sqliteIndex,
 *     markdown: markdownIndex,  // Uses all defaults! (rootPath defaults to './blog')
 *     // Or explicit: ({ id, db }) => markdownIndex({ id, db })
 *     // Or custom path: ({ id, db }) => markdownIndex({ id, db, rootPath: './data' })
 *     // Or custom serializers: ({ id, db }) => markdownIndex({ id, db, serializers: {...} })
 *   },
 *
 *   providers: [
 *     ({ ydoc }) => {
 *       // Set up persistence
 *       new IndexeddbPersistence('blog', ydoc);
 *     },
 *   ],
 *
 *   actions: ({ db, indexes }) => ({
 *     getPublishedPosts: defineQuery({
 *       handler: async () => {
 *         return await indexes.sqlite.posts
 *           .select()
 *           .where(isNotNull(indexes.sqlite.posts.publishedAt))
 *       }
 *     }),
 *
 *     createPost: defineMutation({
 *       input: Type.Object({ title: Type.String() }),
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
	const TDeps extends readonly AnyWorkspaceConfig[],
	const TId extends string,
	const TVersion extends number,
	TWorkspaceSchema extends WorkspaceSchema,
	const TIndexResults extends WorkspaceIndexMap,
	TActionMap extends WorkspaceActionMap,
>(
	workspace: WorkspaceConfig<
		TDeps,
		TId,
		TVersion,
		TWorkspaceSchema,
		TIndexResults,
		TActionMap
	>,
): WorkspaceConfig<
	TDeps,
	TId,
	TVersion,
	TWorkspaceSchema,
	TIndexResults,
	TActionMap
> {
	// Validate workspace ID
	if (!workspace.id || typeof workspace.id !== 'string') {
		throw new Error('Workspace must have a valid string ID');
	}

	// Validate workspace version
	if (!workspace.version || typeof workspace.version !== 'number') {
		throw new Error('Workspace must have a valid number version');
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
 * Workspace configuration
 *
 * Fully-featured workspace configuration used for defining workspaces and their dependencies.
 *
 * ## Dependency Constraint
 *
 * The `dependencies` field uses `AnyWorkspaceConfig[]` as a minimal constraint.
 * This prevents infinite type recursion while providing type information for action access.
 *
 * By using `AnyWorkspaceConfig` (which only includes `id` and `actions`), we stop
 * recursive type inference. Without this constraint, TypeScript would try to infer dependencies
 * of dependencies infinitely, causing "Type instantiation is excessively deep" errors.
 *
 * ## Runtime vs Type-level
 *
 * At runtime, all workspace configs have full properties (schema, indexes, etc.).
 * The minimal constraint is purely for type inference. The flat/hoisted dependency resolution
 * ensures all workspaces are initialized correctly.
 */
export type WorkspaceConfig<
	TDeps extends readonly AnyWorkspaceConfig[] = readonly AnyWorkspaceConfig[],
	TId extends string = string,
	TVersion extends number = number,
	TWorkspaceSchema extends WorkspaceSchema = WorkspaceSchema,
	TIndexResults extends WorkspaceIndexMap = WorkspaceIndexMap,
	TActionMap extends WorkspaceActionMap = WorkspaceActionMap,
> = {
	id: TId;
	version: TVersion;
	schema: TWorkspaceSchema;
	dependencies?: TDeps;
	indexes: {
		[K in keyof TIndexResults]: Index<TWorkspaceSchema, TIndexResults[K]>;
	};
	providers?: Provider[];
	actions: (context: {
		db: Db<TWorkspaceSchema>;
		workspaces: WorkspacesToActionMaps<TDeps>;
		indexes: TIndexResults;
	}) => TActionMap;
};

/**
 * Minimal workspace constraint for generic bounds
 * Use this in `extends` clauses to avoid contravariance issues
 *
 * @example
 * ```typescript
 * function foo<T extends readonly AnyWorkspaceConfig[]>(configs: T) { ... }
 * ```
 */
export type AnyWorkspaceConfig = {
	id: string;
	actions: (context: any) => WorkspaceActionMap;
};

/**
 * Maps an array of workspace configs to an object of ActionMaps keyed by workspace id.
 *
 * Takes an array of workspace dependencies and merges them into a single object where:
 * - Each key is a dependency id
 * - Each value is the action map exported from that dependency
 *
 * This allows accessing dependency actions as `workspaces.dependencyId.actionName()`.
 *
 * @example
 * ```typescript
 * // Given dependency configs:
 * const authWorkspace = defineWorkspace({ id: 'auth', actions: () => ({ login: ..., logout: ... }) })
 * const storageWorkspace = defineWorkspace({ id: 'storage', actions: () => ({ upload: ..., download: ... }) })
 *
 * // WorkspacesToActionMaps<[typeof authWorkspace, typeof storageWorkspace]> produces:
 * {
 *   auth: { login: ..., logout: ... },
 *   storage: { upload: ..., download: ... }
 * }
 * ```
 */
export type WorkspacesToActionMaps<WS extends readonly AnyWorkspaceConfig[]> = {
	[W in WS[number] as W extends { id: infer TId extends string }
		? TId
		: never]: W extends {
		actions: (context: any) => infer TActionMap extends WorkspaceActionMap;
	}
		? TActionMap
		: never;
};
