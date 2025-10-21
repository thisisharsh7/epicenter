import type * as Y from 'yjs';
import type { Db } from '../../db/core';
import type { WorkspaceActionMap } from '../actions';
import type { WorkspaceIndexMap } from '../indexes';
import type { WorkspaceSchema } from '../schema';

/**
 * Define an Epicenter with YJS-first architecture.
 *
 * ## Epicenter Structure
 *
 * Each Epicenter is a self-contained module that can:
 * - Have its own **tables**: Column schemas (pure JSON, no Drizzle)
 * - Have its own **indexes**: Synchronized snapshots for querying (SQLite, markdown, vector, etc.)
 * - Have its own **actions**: Business logic with access to tables and indexes
 * - Compose other Epicenters via the **workspaces** array
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
 * const blogEpicenter = defineEpicenter({
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
export function defineEpicenter<
	const TWorkspaces extends readonly AnyEpicenterConfig[],
	const TId extends string,
	const TVersion extends number,
	const TName extends string,
	TWorkspaceSchema extends WorkspaceSchema,
	TIndexMap extends WorkspaceIndexMap,
	TActionMap extends WorkspaceActionMap,
>(
	input: EpicenterConfigInput<
		TWorkspaces,
		TId,
		TVersion,
		TName,
		TWorkspaceSchema,
		TIndexMap,
		TActionMap
	>,
): EpicenterConfig<
	TWorkspaces,
	TId,
	TVersion,
	TName,
	TWorkspaceSchema,
	TIndexMap,
	TActionMap
> {
	// Validate epicenter ID
	if (!input.id || typeof input.id !== 'string') {
		throw new Error('Epicenter must have a valid string ID');
	}

	// Apply defaults
	const version = input.version ?? (1 as TVersion);
	const name = input.name ?? (input.id as TName);

	// Validate version after applying default
	if (typeof version !== 'number') {
		throw new Error('Epicenter version must be a number');
	}

	// Validate workspaces
	if (input.workspaces) {
		if (!Array.isArray(input.workspaces)) {
			throw new Error('Workspaces must be an array of epicenter configs');
		}

		// Basic validation - just check each workspace has an id
		for (const ws of input.workspaces) {
			if (!ws || typeof ws !== 'object' || !ws.id) {
				throw new Error(
					'Invalid workspace: workspaces must be epicenter configs with id',
				);
			}
		}
	}

	return {
		...input,
		version,
		name,
	} as EpicenterConfig<
		TWorkspaces,
		TId,
		TVersion,
		TName,
		TWorkspaceSchema,
		TIndexMap,
		TActionMap
	>;
}


/**
 * Minimal epicenter constraint for generic bounds
 * Use this in `extends` clauses to avoid contravariance issues
 *
 * @example
 * ```typescript
 * function foo<T extends readonly AnyEpicenterConfig[]>(configs: T) { ... }
 * ```
 */
export type AnyEpicenterConfig = {
	id: string;
	version: number;
	name: string;
	actions?: (context: any) => WorkspaceActionMap;
};


/**
 * Input type for defineEpicenter function
 * Allows optional version and name (defaults applied in defineEpicenter)
 */
export type EpicenterConfigInput<
	TWorkspaces extends readonly AnyEpicenterConfig[] = readonly AnyEpicenterConfig[],
	TId extends string = string,
	TVersion extends number = number,
	TName extends string = string,
	TWorkspaceSchema extends WorkspaceSchema = WorkspaceSchema,
	TIndexMap extends WorkspaceIndexMap = WorkspaceIndexMap,
	TActionMap extends WorkspaceActionMap = WorkspaceActionMap,
> = {
	id: TId;
	version?: TVersion;
	name?: TName;
	workspaces?: TWorkspaces;
	schema?: TWorkspaceSchema;
	indexes?: (context: { db: Db<TWorkspaceSchema> }) =>
		| TIndexMap
		| Promise<TIndexMap>;
	setupYDoc?: (ydoc: Y.Doc) => void;
	actions?: (context: {
		db: Db<TWorkspaceSchema>;
		workspaces: WorkspaceActionsMap<TWorkspaces>;
		indexes: TIndexMap;
	}) => TActionMap;
};

/**
 * Epicenter configuration
 *
 * Fully-featured epicenter configuration used for defining epicenters and their composed workspaces.
 *
 * ## Workspace Constraint
 *
 * The `workspaces` field uses `AnyEpicenterConfig[]` as a minimal constraint.
 * This prevents infinite type recursion while providing type information for action access.
 *
 * By using `AnyEpicenterConfig` (which only includes `id`, `name`, and optional `actions`), we stop
 * recursive type inference. Without this constraint, TypeScript would try to infer workspaces
 * of workspaces infinitely, causing "Type instantiation is excessively deep" errors.
 *
 * ## Runtime vs Type-level
 *
 * At runtime, all epicenter configs have full properties (schema, indexes, etc.).
 * The minimal constraint is purely for type inference. The flat/hoisted workspace resolution
 * ensures all epicenters are initialized correctly.
 *
 * ## Optional Features
 *
 * Schema, indexes, and actions are optional to support pure composition use cases.
 * An epicenter can be:
 * - Pure composition: only `workspaces` array (no schema/indexes/actions)
 * - Pure features: schema/indexes/actions (no workspaces)
 * - Hybrid: both workspaces AND its own features
 */
export type EpicenterConfig<
	TWorkspaces extends readonly AnyEpicenterConfig[] = readonly AnyEpicenterConfig[],
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
	workspaces?: TWorkspaces;
	schema?: TWorkspaceSchema;
	indexes?: (context: { db: Db<TWorkspaceSchema> }) =>
		| TIndexMap
		| Promise<TIndexMap>;
	setupYDoc?: (ydoc: Y.Doc) => void;
	actions?: (context: {
		db: Db<TWorkspaceSchema>;
		workspaces: WorkspaceActionsMap<TWorkspaces>;
		indexes: TIndexMap;
	}) => TActionMap;
};


/**
 * Maps workspace epicenters to their action maps.
 *
 * Takes an array of epicenter workspaces and merges them into a single object where:
 * - Each key is a workspace name
 * - Each value is the action map exported from that workspace
 *
 * This allows accessing workspace actions as `workspaces.workspaceName.actionName()`.
 *
 * @example
 * ```typescript
 * // Given workspaces: [authEpicenter, storageEpicenter]
 * // Results in type: { auth: AuthActions, storage: StorageActions }
 * // Used as: workspaces.auth.login(), workspaces.storage.uploadFile()
 * ```
 *
 * Constrains to `AnyEpicenterConfig` (name + optional actions) to avoid recursive type inference.
 */
export type WorkspaceActionsMap<TWorkspaces extends readonly AnyEpicenterConfig[]> =
	TWorkspaces extends readonly []
		? Record<string, never>
		: {
				[W in TWorkspaces[number] as W extends { name: infer TName extends string }
					? TName
					: never]: W extends {
					actions?: (
						context: any,
					) => infer TActionMap extends WorkspaceActionMap;
				}
					? TActionMap
					: never;
			};

