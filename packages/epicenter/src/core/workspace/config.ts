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
	const TDeps extends readonly AnyWorkspaceConfig[],
	const TId extends string,
	const TVersion extends number,
	const TName extends string,
	TWorkspaceSchema extends WorkspaceSchema,
	TIndexesFn extends (context: {
		db: Db<TWorkspaceSchema>;
	}) => WorkspaceIndexMap | Promise<WorkspaceIndexMap>,
	TActionsFn extends (context: {
		db: Db<TWorkspaceSchema>;
		workspaces: DependencyActionsMap<TDeps>;
		indexes: Awaited<ReturnType<TIndexesFn>>;
	}) => WorkspaceActionMap,
>(
	workspace: WorkspaceConfig<
		TDeps,
		TId,
		TVersion,
		TName,
		TWorkspaceSchema,
		TIndexesFn,
		TActionsFn
	>,
): WorkspaceConfig<
	TDeps,
	TId,
	TVersion,
	TName,
	TWorkspaceSchema,
	TIndexesFn,
	TActionsFn
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
 * Function signature for defining workspace indexes
 */
export type IndexesFn<TWorkspaceSchema extends WorkspaceSchema> = (context: {
	db: Db<TWorkspaceSchema>;
}) => WorkspaceIndexMap | Promise<WorkspaceIndexMap>;

/**
 * Function signature for defining workspace actions
 */
export type ActionsFn<
	TWorkspaceSchema extends WorkspaceSchema,
	TDeps extends readonly AnyWorkspaceConfig[],
	TIndexesFn extends IndexesFn<TWorkspaceSchema>,
> = (context: {
	db: Db<TWorkspaceSchema>;
	workspaces: DependencyActionsMap<TDeps>;
	indexes: Awaited<ReturnType<TIndexesFn>>;
}) => WorkspaceActionMap;

/**
 * Workspace configuration definition (Root/Top-level workspace)
 *
 * This is the root workspace type in a three-tier dependency hierarchy designed to
 * prevent infinite type recursion while preserving full type information for immediate dependencies.
 *
 * ## Three-Tier Type Hierarchy
 *
 * ```
 * Layer 1 (Root): WorkspaceConfig
 *   dependencies: ImmediateDependencyWorkspaceConfig[] ← Full type info
 *     dependencies: DependencyWorkspaceConfig[] ← Minimal constraint
 * ```
 *
 * @see ImmediateDependencyWorkspaceConfig for Layer 2 (immediate dependencies)
 * @see DependencyWorkspaceConfig for Layer 3 (transitive dependencies, minimal constraint)
 */
export type WorkspaceConfig<
	TDeps extends readonly AnyWorkspaceConfig[] = readonly AnyWorkspaceConfig[],
	TId extends string = string,
	TVersion extends number = number,
	TName extends string = string,
	TWorkspaceSchema extends WorkspaceSchema = WorkspaceSchema,
	TIndexesFn extends IndexesFn<TWorkspaceSchema> = IndexesFn<TWorkspaceSchema>,
	TActionsFn extends ActionsFn<TWorkspaceSchema, TDeps, TIndexesFn> = ActionsFn<
		TWorkspaceSchema,
		TDeps,
		TIndexesFn
	>,
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
	 *
	 * @example
	 * ```typescript
	 * indexes: async ({ db }) => ({
	 *   sqlite: await sqliteIndex(db, { database: ':memory:' }),
	 *   markdown: markdownIndex(db, { storagePath: './data' }),
	 * })
	 * ```
	 */
	indexes: TIndexesFn;

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
	actions: TActionsFn;
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
	name: string;
	actions: (context: any) => WorkspaceActionMap;
};

/**
 * Dependency workspace config (Layer 3: Transitive dependencies, minimal constraint)
 *
 * This is the minimal constraint type for transitive dependencies, designed to prevent
 * infinite type recursion while still providing type information for action access.
 *
 * ## Why Minimal?
 *
 * By including only `id`, `name`, and `actions` (and crucially, omitting the `dependencies` field),
 * this type stops the recursive type inference chain. Without this constraint, TypeScript would
 * try to infer dependencies of dependencies of dependencies infinitely, causing compilation to
 * slow down or fail with "Type instantiation is excessively deep" errors.
 *
 * ## Runtime vs Type-level
 *
 * At runtime, objects passed as dependencies are full workspace configs with all properties.
 * This type is purely a type-level constraint for type inference. The flat dependency resolution
 * (hoisted dependencies at root level) ensures all transitive dependencies are available during
 * initialization, even though the type system treats them as minimal constraints.
 *
 * ## Three-Tier Hierarchy Position
 *
 * ```
 * Layer 1: WorkspaceConfig                     ← Full workspace
 *   dependencies: ImmediateDependencyWorkspaceConfig[]
 *     dependencies: DependencyWorkspaceConfig[] ← You are here (minimal)
 * ```
 *
 * @see WorkspaceConfig for Layer 1 (root workspace)
 * @see ImmediateDependencyWorkspaceConfig for Layer 2 (immediate dependencies)
 */
export type DependencyWorkspaceConfig<
	TId extends string = string,
	TName extends string = string,
	TActionMap extends WorkspaceActionMap = WorkspaceActionMap,
> = {
	id: TId;
	name: TName;
	actions: (context: any) => TActionMap;
	// NOTE: No dependencies field - this prevents recursive type inference
};

/**
 * Immediate dependency workspace config (Layer 2: Direct dependencies, full-featured)
 *
 * This is a fully-featured workspace configuration for workspaces that are direct dependencies
 * of the root workspace. It's identical to WorkspaceConfig in structure except for its
 * dependencies constraint.
 *
 * ## Key Difference from WorkspaceConfig
 *
 * While WorkspaceConfig allows dependencies of type `ImmediateDependencyWorkspaceConfig[]`,
 * this type constrains dependencies to `DependencyWorkspaceConfig[]` (the minimal type).
 * This two-level depth limit prevents infinite type recursion while still providing full
 * type information for the most common use case: root workspace depending on immediate dependencies.
 *
 * ## Why Two Levels?
 *
 * Most applications have dependency graphs 1-2 levels deep. This type system provides:
 * - **Level 1 (Root → Immediate)**: Full type inference with all workspace properties
 * - **Level 2 (Immediate → Transitive)**: Minimal constraint to stop recursion
 *
 * The flat/hoisted dependency resolution at runtime ensures all workspaces are initialized
 * correctly, regardless of the type-level constraints.
 *
 * ## Three-Tier Hierarchy Position
 *
 * ```
 * Layer 1: WorkspaceConfig
 *   dependencies: ImmediateDependencyWorkspaceConfig[] ← You are here (full-featured)
 *     dependencies: DependencyWorkspaceConfig[]          ← Minimal constraint
 * ```
 *
 * @see WorkspaceConfig for Layer 1 (root workspace)
 * @see DependencyWorkspaceConfig for Layer 3 (transitive dependencies, minimal constraint)
 */
export type ImmediateDependencyWorkspaceConfig<
	TDeps extends readonly AnyWorkspaceConfig[] = readonly AnyWorkspaceConfig[],
	TId extends string = string,
	TVersion extends number = number,
	TName extends string = string,
	TWorkspaceSchema extends WorkspaceSchema = WorkspaceSchema,
	TIndexesFn extends (context: {
		db: Db<TWorkspaceSchema>;
	}) => WorkspaceIndexMap | Promise<WorkspaceIndexMap> = (context: {
		db: Db<TWorkspaceSchema>;
	}) => WorkspaceIndexMap | Promise<WorkspaceIndexMap>,
	TActionsFn extends (context: {
		db: Db<TWorkspaceSchema>;
		workspaces: DependencyActionsMap<TDeps>;
		indexes: Awaited<ReturnType<TIndexesFn>>;
	}) => WorkspaceActionMap = (context: {
		db: Db<TWorkspaceSchema>;
		workspaces: DependencyActionsMap<TDeps>;
		indexes: Awaited<ReturnType<TIndexesFn>>;
	}) => WorkspaceActionMap,
> = {
	id: TId;
	version: TVersion;
	name: TName;
	schema: TWorkspaceSchema;
	dependencies?: TDeps;
	indexes: TIndexesFn;
	setupYDoc?: (ydoc: Y.Doc) => void;
	actions: TActionsFn;
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
 * Works with both DependencyWorkspaceConfig and ImmediateDependencyWorkspaceConfig
 * by constraining to the common structure (name + actions), avoiding recursive type inference.
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
