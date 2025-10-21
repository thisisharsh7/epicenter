import type * as Y from 'yjs';
import type { Db } from '../../db/core';
import type { WorkspaceActionMap } from '../actions';
import type { WorkspaceIndexMap } from '../indexes';
import type { WorkspaceSchema } from '../schema';

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
 * await indexes.sqlite.posts.select().where(...);
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
 *       content: ytext({ nullable: true }),
 *       category: select({ options: ['tech', 'personal'] }),
 *       views: integer({ default: 0 }),
 *     }
 *   },
 *
 *   indexes: async ({ db }) => ({
 *     sqlite: await sqliteIndex(db, { database: ':memory:' }),
 *     markdown: markdownIndex(db, { storagePath: './data' }),
 *   }),
 *
 *   setupYDoc: (ydoc) => {
 *     // Optional: Set up persistence
 *     new IndexeddbPersistence('blog', ydoc);
 *   },
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
	const TName extends string,
	TWorkspaceSchema extends WorkspaceSchema,
	TIndexMap extends WorkspaceIndexMap,
	TActionMap extends WorkspaceActionMap,
>(
	workspace: WorkspaceConfig<
		TDeps,
		TId,
		TVersion,
		TName,
		TWorkspaceSchema,
		TIndexMap,
		TActionMap
	>,
): WorkspaceConfig<
	TDeps,
	TId,
	TVersion,
	TName,
	TWorkspaceSchema,
	TIndexMap,
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
	name: string;
	actions: (context: any) => WorkspaceActionMap;
};


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
 * By using `AnyWorkspaceConfig` (which only includes `id`, `name`, and `actions`), we stop
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
	TName extends string = string,
	TWorkspaceSchema extends WorkspaceSchema = WorkspaceSchema,
	TIndexMap extends WorkspaceIndexMap = WorkspaceIndexMap,
	TActionMap extends WorkspaceActionMap = WorkspaceActionMap,
> = {
	id: TId;
	version: TVersion;
	name: TName;
	schema: TWorkspaceSchema;
	dependencies?: TDeps;
	indexes: (context: { db: Db<TWorkspaceSchema> }) =>
		| TIndexMap
		| Promise<TIndexMap>;
	setupYDoc?: (ydoc: Y.Doc) => void;
	actions: (context: {
		db: Db<TWorkspaceSchema>;
		workspaces: DependencyActionsMap<TDeps>;
		indexes: TIndexMap;
	}) => TActionMap;
};

/**
 * Maps workspace dependencies to their action maps.
 *
 * Takes an array of workspace dependencies and merges them into a single object where:
 * - Each key is a dependency name
 * - Each value is the action map exported from that dependency
 *
 * This allows accessing dependency actions as `workspaces.dependencyName.actionName()`.
 *
 * @example
 * ```typescript
 * // Given dependencies: [authWorkspace, storageWorkspace]
 * // Results in type: { auth: AuthActions, storage: StorageActions }
 * // Used as: workspaces.auth.login(), workspaces.storage.uploadFile()
 * ```
 *
 * Constrains to `AnyWorkspaceConfig` (name + actions only) to avoid recursive type inference.
 */
export type DependencyActionsMap<TDeps extends readonly AnyWorkspaceConfig[]> =
	TDeps extends readonly []
		? Record<string, never>
		: {
				[W in TDeps[number] as W extends { name: infer TName extends string }
					? TName
					: never]: W extends {
					actions: (
						context: any,
					) => infer TActionMap extends WorkspaceActionMap;
				}
					? TActionMap
					: never;
			};
