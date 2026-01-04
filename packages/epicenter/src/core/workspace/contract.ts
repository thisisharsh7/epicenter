import * as Y from 'yjs';

import { type Actions, isAction } from '../actions';
import { createTables, type Tables } from '../db/core';
import { createKv, type Kv } from '../kv';
import type { Provider, Providers } from '../provider.shared';
import type { KvSchema, TablesSchema } from '../schema';
import type { ProviderPaths, WorkspacePaths } from '../types';

/**
 * A workspace schema defines the pure data shape of a workspace.
 *
 * This type is fully JSON-serializable and contains no methods or runtime behavior.
 * It represents the configuration passed to `defineWorkspace()`.
 *
 * Use `defineWorkspace()` to create a `Workspace` object that adds fluent methods
 * like `.withProviders()` for creating runnable clients.
 */
export type WorkspaceSchema<
	TId extends string = string,
	TTablesSchema extends TablesSchema = TablesSchema,
	TKvSchema extends KvSchema = KvSchema,
> = {
	id: TId;
	tables: TTablesSchema;
	kv?: TKvSchema;
	description?: string;
};

/**
 * JSON-serializable manifest of a workspace for introspection.
 *
 * Used by `.toJSON()` to produce a snapshot of the workspace configuration
 * without any runtime behavior. Useful for:
 * - Generating OpenAPI documentation
 * - MCP tool registration
 * - CLI command discovery
 * - Debugging and logging
 */
export type WorkspaceManifest = {
	id: string;
	description?: string;
	tables: TablesSchema;
	kv?: KvSchema;
	actions: Record<
		string,
		{
			type: 'query' | 'mutation';
			description?: string;
			input?: unknown;
			output?: unknown;
		}
	>;
};

/**
 * A map of provider factory functions keyed by provider ID.
 *
 * Providers add capabilities to workspaces: persistence, sync, SQL queries, etc.
 * Each provider receives context and optionally returns exports accessible via
 * `ctx.providers[providerId]` in action handlers.
 */
export type ProviderMap<
	TTablesSchema extends TablesSchema = TablesSchema,
	TKvSchema extends KvSchema = KvSchema,
> = Record<string, Provider<TTablesSchema, TKvSchema>>;

/**
 * Utility type to infer the exports from a provider map.
 *
 * Maps each provider key to its return type (unwrapped from Promise if async).
 * Providers that return void produce empty objects.
 */
export type InferProviderExports<TProviders> = {
	[K in keyof TProviders]: TProviders[K] extends Provider<
		TablesSchema,
		KvSchema,
		infer TExports
	>
		? TExports extends Providers
			? TExports
			: Record<string, never>
		: Record<string, never>;
};

/**
 * A workspace object returned by `defineWorkspace()`.
 *
 * Extends the JSON-serializable schema with fluent methods for building
 * runnable clients. Use the chaining API:
 *
 * ```typescript
 * const client = await defineWorkspace({ id: 'blog', tables: { ... } })
 *   .withProviders({ sqlite: sqliteProvider })
 *   .withActions({ createPost: defineMutation({ ... }) })
 *   .create();
 * ```
 */
export type Workspace<
	TId extends string = string,
	TTablesSchema extends TablesSchema = TablesSchema,
	TKvSchema extends KvSchema = KvSchema,
> = WorkspaceSchema<TId, TTablesSchema, TKvSchema> & {
	/** Add providers (SQLite, IndexedDB, markdown, sync, etc.) to the workspace. */
	withProviders<TProviders extends ProviderMap<TTablesSchema, TKvSchema>>(
		providers: TProviders,
	): WorkspaceWithProviders<TId, TTablesSchema, TKvSchema, TProviders>;

	/** Get a JSON-serializable manifest of the workspace for introspection. */
	toJSON(): WorkspaceManifest;
};

/**
 * A workspace with providers attached, ready for actions.
 *
 * Intermediate state in the chaining API after `.withProviders()`.
 * Call `.withActions()` to add actions, then `.create()` to get a client.
 */
export type WorkspaceWithProviders<
	TId extends string,
	TTablesSchema extends TablesSchema,
	TKvSchema extends KvSchema,
	TProviders extends ProviderMap<TTablesSchema, TKvSchema>,
> = WorkspaceSchema<TId, TTablesSchema, TKvSchema> & {
	/** Internal: provider factories (not yet initialized). */
	$providers: TProviders;

	/** Add actions (queries and mutations) to the workspace. */
	withActions<TActions extends Actions>(
		actions: TActions,
	): WorkspaceWithActions<TId, TTablesSchema, TKvSchema, TProviders, TActions>;

	/** Get a JSON-serializable manifest of the workspace for introspection. */
	toJSON(): WorkspaceManifest;
};

/**
 * A workspace with providers and actions, ready to create a client.
 *
 * Final state in the chaining API. Call `.create()` to initialize providers
 * and get a fully functional workspace client.
 */
export type WorkspaceWithActions<
	TId extends string,
	TTablesSchema extends TablesSchema,
	TKvSchema extends KvSchema,
	TProviders extends ProviderMap<TTablesSchema, TKvSchema>,
	TActions extends Actions,
> = WorkspaceSchema<TId, TTablesSchema, TKvSchema> & {
	/** Internal: provider factories (not yet initialized). */
	$providers: TProviders;
	/** Internal: action definitions (not yet bound to context). */
	$actions: TActions;

	/**
	 * Initialize providers and create a workspace client.
	 *
	 * This is the final step that:
	 * 1. Creates a YJS document with the workspace ID as GUID
	 * 2. Initializes all providers in parallel
	 * 3. Binds actions to the handler context (tables, kv, providers, paths)
	 * 4. Returns a client with callable actions and table accessors
	 */
	create(
		options?: CreateOptions,
	): Promise<
		BoundWorkspaceClient<TId, TTablesSchema, TKvSchema, TProviders, TActions>
	>;

	/** Get a JSON-serializable manifest of the workspace for introspection. */
	toJSON(): WorkspaceManifest;
};

/**
 * Context passed to action handlers as the second argument.
 *
 * Provides typed access to workspace resources:
 * - `tables`: YJS-backed table operations (get, upsert, update, delete, etc.)
 * - `kv`: Key-value store for simple values
 * - `providers`: Exports from initialized providers (SQLite db, sync operations, etc.)
 * - `paths`: Filesystem paths (undefined in browser environments)
 *
 * @example
 * ```typescript
 * const getUser = defineQuery({
 *   input: type({ id: 'string' }),
 *   output: type({ id: 'string', name: 'string' }),
 *   handler: ({ id }, ctx) => {
 *     // Access tables
 *     const result = ctx.tables.users.get({ id });
 *
 *     // Access provider exports (e.g., SQLite)
 *     const users = ctx.providers.sqlite.users.select().all();
 *
 *     // Access paths (Node.js only)
 *     console.log(ctx.paths?.project);
 *   },
 * });
 * ```
 */
export type HandlerContext<
	TTablesSchema extends TablesSchema = TablesSchema,
	TKvSchema extends KvSchema = KvSchema,
	TProviderExports extends Record<string, Providers> = Record<
		string,
		Providers
	>,
> = {
	tables: Tables<TTablesSchema>;
	kv: Kv<TKvSchema>;
	providers: TProviderExports;
	paths: WorkspacePaths | undefined;
};

/**
 * Options for creating a workspace client.
 */
export type CreateOptions = {
	/**
	 * Project directory for provider paths.
	 * Defaults to `process.cwd()` in Node.js, `undefined` in browser.
	 */
	projectDir?: string;
};

/**
 * A fully initialized workspace client with bound actions.
 *
 * This is the main interface for interacting with a workspace:
 * - Call actions via `client.actions.actionName(input)`
 * - Access tables via `client.tables.tableName.get/upsert/etc.`
 * - Access the underlying YJS document via `client.ydoc`
 *
 * Supports `await using` for automatic cleanup:
 * ```typescript
 * {
 *   await using client = await workspace.create();
 *   await client.actions.createPost({ title: 'Hello' });
 * } // Automatically cleaned up here
 * ```
 */
export type BoundWorkspaceClient<
	TId extends string = string,
	TTablesSchema extends TablesSchema = TablesSchema,
	TKvSchema extends KvSchema = KvSchema,
	TProviders extends ProviderMap<TTablesSchema, TKvSchema> = ProviderMap<
		TTablesSchema,
		TKvSchema
	>,
	TActions extends Actions = Actions,
> = {
	/** The workspace ID. */
	id: TId;
	/** YJS-backed table operations. */
	tables: Tables<TTablesSchema>;
	/** Key-value store for simple values. */
	kv: Kv<TKvSchema>;
	/** Exports from initialized providers. */
	providers: InferProviderExports<TProviders>;
	/** Filesystem paths (undefined in browser). */
	paths: WorkspacePaths | undefined;
	/** The underlying YJS document. */
	ydoc: Y.Doc;
	/** Bound action methods (queries and mutations). */
	actions: TActions;
	/** Clean up resources (close providers, destroy YJS doc). */
	destroy(): Promise<void>;
	/** Symbol.asyncDispose for `await using` support. */
	[Symbol.asyncDispose](): Promise<void>;
};

type InitializedWorkspace<
	TTablesSchema extends TablesSchema,
	TKvSchema extends KvSchema,
	TProviders extends ProviderMap<TTablesSchema, TKvSchema>,
> = {
	ydoc: Y.Doc;
	tables: Tables<TTablesSchema>;
	kv: Kv<TKvSchema>;
	providerExports: InferProviderExports<TProviders>;
	paths: WorkspacePaths | undefined;
	cleanup: () => Promise<void>;
};

/**
 * Initialize a workspace: create YJS doc, tables, kv, and run provider factories.
 *
 * This is an internal function called by `.create()`. It:
 * 1. Creates a YJS document with the workspace ID as GUID
 * 2. Creates typed table and kv helpers backed by the YJS doc
 * 3. Runs all provider factories in parallel
 * 4. Returns everything needed to construct a BoundWorkspaceClient
 */
async function initializeWorkspace<
	TId extends string,
	TTablesSchema extends TablesSchema,
	TKvSchema extends KvSchema,
	TProviders extends ProviderMap<TTablesSchema, TKvSchema>,
>(
	config: WorkspaceSchema<TId, TTablesSchema, TKvSchema>,
	providerFactories: TProviders,
	options?: CreateOptions,
): Promise<InitializedWorkspace<TTablesSchema, TKvSchema, TProviders>> {
	const projectDir =
		options?.projectDir ??
		(typeof process !== 'undefined' ? process.cwd() : undefined);

	const ydoc = new Y.Doc({ guid: config.id });
	const tables = createTables(ydoc, config.tables);
	const kv = createKv(ydoc, (config.kv ?? {}) as TKvSchema);

	let buildProviderPaths:
		| ((projectDir: string, providerId: string) => ProviderPaths)
		| undefined;
	let getEpicenterDir: ((projectDir: string) => string) | undefined;

	if (projectDir) {
		const pathsModule = await import('../paths');
		buildProviderPaths = (dir, id) =>
			pathsModule.buildProviderPaths(dir as WorkspacePaths['project'], id);
		getEpicenterDir = (dir) =>
			pathsModule.getEpicenterDir(dir as WorkspacePaths['project']);
	}

	const providerExports = Object.fromEntries(
		await Promise.all(
			Object.entries(providerFactories).map(
				async ([providerId, providerFn]) => {
					const paths: ProviderPaths | undefined =
						projectDir && buildProviderPaths
							? buildProviderPaths(projectDir, providerId)
							: undefined;

					const result = await providerFn({
						id: config.id,
						providerId,
						ydoc,
						tables,
						kv,
						paths,
					});
					return [providerId, result ?? {}];
				},
			),
		),
	) as InferProviderExports<TProviders>;

	const workspacePaths: WorkspacePaths | undefined =
		projectDir && getEpicenterDir
			? {
					project: projectDir as WorkspacePaths['project'],
					epicenter: getEpicenterDir(projectDir) as WorkspacePaths['epicenter'],
				}
			: undefined;

	const cleanup = async () => {
		await Promise.all(
			Object.values(providerExports).map((provider) =>
				(provider as Providers).destroy?.(),
			),
		);
		ydoc.destroy();
	};

	return {
		ydoc,
		tables,
		kv,
		providerExports,
		paths: workspacePaths,
		cleanup,
	};
}

/**
 * Bind actions to a handler context, making them callable.
 *
 * Takes unbound actions (which expect context as 2nd argument) and returns
 * new functions that have context pre-bound. Recursively handles namespaces.
 * Preserves action metadata (type, input, output, description).
 */
function bindActionsWithContext<TActions extends Actions>(
	actions: TActions,
	ctx: HandlerContext,
): TActions {
	const bound: Record<string, unknown> = {};

	for (const [key, actionOrNamespace] of Object.entries(actions)) {
		if (isAction(actionOrNamespace)) {
			const action = actionOrNamespace;
			const hasInput = 'input' in action && action.input !== undefined;

			const boundFn = hasInput
				? // biome-ignore lint/suspicious/noExplicitAny: Action invocation requires flexibility
					(input: unknown) => (action as any)(input, ctx)
				: () => (action as any)(ctx);

			bound[key] = Object.assign(boundFn, {
				type: action.type,
				input: action.input,
				output: action.output,
				description: action.description,
			});
		} else {
			bound[key] = bindActionsWithContext(actionOrNamespace as Actions, ctx);
		}
	}

	return bound as TActions;
}

/**
 * Convert actions to a JSON-serializable manifest format.
 *
 * Extracts metadata (type, description, input, output) from each action
 * for introspection purposes. Used by `.toJSON()`.
 */
function actionsToManifest(actions: Actions): WorkspaceManifest['actions'] {
	const manifest: WorkspaceManifest['actions'] = {};

	for (const [key, actionOrNamespace] of Object.entries(actions)) {
		if (isAction(actionOrNamespace)) {
			manifest[key] = {
				type: actionOrNamespace.type,
				description: actionOrNamespace.description,
				input: actionOrNamespace.input,
				output: actionOrNamespace.output,
			};
		}
	}

	return manifest;
}

/**
 * Define a collaborative workspace with YJS-first architecture.
 *
 * A workspace is a self-contained domain module with tables, providers, and actions.
 * Use the fluent chaining API to configure and create a client:
 *
 * @example
 * ```typescript
 * const workspace = defineWorkspace({
 *   id: 'blog',
 *   tables: {
 *     posts: { id: id(), title: text(), published: boolean({ default: false }) },
 *   },
 * });
 *
 * const client = await workspace
 *   .withProviders({ sqlite: sqliteProvider })
 *   .withActions({
 *     createPost: defineMutation({
 *       input: type({ title: 'string' }),
 *       output: type({ id: 'string' }),
 *       handler: ({ title }, ctx) => {
 *         const id = generateId();
 *         ctx.tables.posts.upsert({ id, title, published: false });
 *         return { id };
 *       },
 *     }),
 *   })
 *   .create();
 *
 * // Use the client
 * const { id } = await client.actions.createPost({ title: 'Hello' });
 * const posts = client.tables.posts.getAllValid();
 *
 * // Clean up
 * await client.destroy();
 * ```
 *
 * @param config - Workspace configuration (id, tables, optional kv and description)
 * @returns A Workspace object with fluent methods for adding providers and actions
 */
export function defineWorkspace<
	const TId extends string,
	TTablesSchema extends TablesSchema,
	TKvSchema extends KvSchema = Record<string, never>,
>(
	config: WorkspaceSchema<TId, TTablesSchema, TKvSchema>,
): Workspace<TId, TTablesSchema, TKvSchema> {
	if (!config.id || typeof config.id !== 'string') {
		throw new Error('Workspace must have a valid string ID');
	}

	return {
		...config,

		withProviders<TProviders extends ProviderMap<TTablesSchema, TKvSchema>>(
			providers: TProviders,
		): WorkspaceWithProviders<TId, TTablesSchema, TKvSchema, TProviders> {
			return {
				...config,
				$providers: providers,

				withActions<TActions extends Actions>(
					actions: TActions,
				): WorkspaceWithActions<
					TId,
					TTablesSchema,
					TKvSchema,
					TProviders,
					TActions
				> {
					return {
						...config,
						$providers: providers,
						$actions: actions,

						async create(
							options?: CreateOptions,
						): Promise<
							BoundWorkspaceClient<
								TId,
								TTablesSchema,
								TKvSchema,
								TProviders,
								TActions
							>
						> {
							const { ydoc, tables, kv, providerExports, paths, cleanup } =
								await initializeWorkspace(config, providers, options);

							const ctx: HandlerContext<
								TTablesSchema,
								TKvSchema,
								InferProviderExports<TProviders>
							> = {
								tables,
								kv,
								providers: providerExports,
								paths,
							};

							const boundActions = bindActionsWithContext(actions, ctx);

							return {
								id: config.id,
								ydoc,
								tables,
								kv,
								providers: providerExports,
								paths,
								actions: boundActions,
								destroy: cleanup,
								[Symbol.asyncDispose]: cleanup,
							};
						},

						toJSON(): WorkspaceManifest {
							return {
								id: config.id,
								description: config.description,
								tables: config.tables,
								kv: config.kv,
								actions: actionsToManifest(actions),
							};
						},
					};
				},

				toJSON(): WorkspaceManifest {
					return {
						id: config.id,
						description: config.description,
						tables: config.tables,
						kv: config.kv,
						actions: {},
					};
				},
			};
		},

		toJSON(): WorkspaceManifest {
			return {
				id: config.id,
				description: config.description,
				tables: config.tables,
				kv: config.kv,
				actions: {},
			};
		},
	};
}
