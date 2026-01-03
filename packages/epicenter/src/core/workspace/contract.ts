import * as Y from 'yjs';

import {
	type ActionContracts,
	isActionContract,
	type MutationContract,
	type QueryContract,
} from '../actions';
import { createTables, type Tables } from '../db/core';
import { createKv, type Kv } from '../kv';
import type { Provider, Providers } from '../provider.shared';
import {
	type KvSchema,
	type StandardSchemaV1,
	type TablesSchema,
} from '../schema';
import type { ProviderPaths, WorkspacePaths } from '../types';

/**
 * A workspace contract defines the pure data shape of a workspace.
 *
 * This type is fully JSON-serializable and contains no methods or runtime behavior.
 * It represents the configuration passed to `defineWorkspace()`.
 *
 * Use `defineWorkspace()` to create a `Workspace` object that adds fluent methods
 * like `.withProviders()` for creating runnable clients.
 */
export type WorkspaceContract<
	TId extends string = string,
	TTablesSchema extends TablesSchema = TablesSchema,
	TKvSchema extends KvSchema = KvSchema,
	TActions extends ActionContracts = ActionContracts,
> = {
	id: TId;
	tables: TTablesSchema;
	kv?: TKvSchema;
	actions: TActions;
	description?: string;
};

/**
 * A workspace object returned by `defineWorkspace()`.
 *
 * Extends the JSON-serializable `WorkspaceContract` with fluent methods for
 * creating runnable clients. Use `.withProviders()` to add persistence/sync
 * capabilities, then either:
 * - `.createWithHandlers(handlers)` for server-side execution
 * - `.createHttpClient(url)` for browser-side HTTP proxy
 */
export type Workspace<
	TId extends string = string,
	TTablesSchema extends TablesSchema = TablesSchema,
	TKvSchema extends KvSchema = KvSchema,
	TActions extends ActionContracts = ActionContracts,
> = WorkspaceContract<TId, TTablesSchema, TKvSchema, TActions> & {
	/**
	 * Add providers (SQLite, IndexedDB, markdown, etc.) to the workspace.
	 */
	withProviders<TProviders extends ProviderMap<TTablesSchema, TKvSchema>>(
		providers: TProviders,
	): WorkspaceWithProviders<
		TId,
		TTablesSchema,
		TKvSchema,
		TActions,
		TProviders
	>;

	/**
	 * Create a client with handlers (no providers).
	 * Shorthand for `.withProviders({}).createWithHandlers(handlers)`.
	 */
	createWithHandlers(
		handlers: HandlersForContracts<
			TActions,
			TTablesSchema,
			TKvSchema,
			Record<string, never>
		>,
		options?: CreateOptions,
	): Promise<
		BoundWorkspaceClient<
			TId,
			TActions,
			TTablesSchema,
			TKvSchema,
			Record<string, never>
		>
	>;

	/**
	 * Create an HTTP client (no providers, actions proxy to server).
	 * Shorthand for `.withProviders({}).createHttpClient(url)`.
	 */
	createHttpClient(
		url: string,
		options?: CreateOptions,
	): Promise<
		BoundWorkspaceClient<
			TId,
			TActions,
			TTablesSchema,
			TKvSchema,
			Record<string, never>
		>
	>;
};

export type ProviderMap<
	TTablesSchema extends TablesSchema = TablesSchema,
	TKvSchema extends KvSchema = KvSchema,
> = Record<string, Provider<TTablesSchema, TKvSchema>>;

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
 * A workspace with providers attached, ready for client creation.
 *
 * Call either:
 * - `.createWithHandlers(handlers)` for server-side execution
 * - `.createHttpClient(url)` for browser-side HTTP proxy
 */
export type WorkspaceWithProviders<
	TId extends string,
	TTablesSchema extends TablesSchema,
	TKvSchema extends KvSchema,
	TActions extends ActionContracts,
	TProviders extends ProviderMap<TTablesSchema, TKvSchema>,
> = WorkspaceContract<TId, TTablesSchema, TKvSchema, TActions> & {
	$providers: TProviders;

	/**
	 * Create a client with handlers that execute locally.
	 *
	 * @example
	 * ```typescript
	 * const client = await blogWorkspace
	 *   .withProviders({ sqlite: sqliteProvider })
	 *   .createWithHandlers({
	 *     publishPost: async (input, ctx) => {
	 *       ctx.tables.posts.update({ id: input.id, published: true });
	 *       return { success: true };
	 *     },
	 *   });
	 * ```
	 */
	createWithHandlers(
		handlers: HandlersForContracts<
			TActions,
			TTablesSchema,
			TKvSchema,
			InferProviderExports<TProviders>
		>,
		options?: CreateOptions,
	): Promise<
		BoundWorkspaceClient<TId, TActions, TTablesSchema, TKvSchema, TProviders>
	>;

	/**
	 * Create an HTTP client where actions proxy to a server.
	 *
	 * Tables and providers are initialized locally (YJS operations work),
	 * but action calls are sent as HTTP requests to the specified URL.
	 *
	 * @example
	 * ```typescript
	 * const client = await blogWorkspace
	 *   .withProviders({ indexeddb: idbProvider })
	 *   .createHttpClient('http://localhost:3913');
	 *
	 * // Tables work locally
	 * client.$tables.posts.upsert({ ... });
	 *
	 * // Actions go over HTTP
	 * await client.publishPost({ id: '123' });
	 * // → POST http://localhost:3913/workspaces/blog/actions/publishPost
	 * ```
	 */
	createHttpClient(
		url: string,
		options?: CreateOptions,
	): Promise<
		BoundWorkspaceClient<TId, TActions, TTablesSchema, TKvSchema, TProviders>
	>;
};

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

export type HandlerFn<
	TInput,
	TOutput,
	TTablesSchema extends TablesSchema = TablesSchema,
	TKvSchema extends KvSchema = KvSchema,
	TProviderExports extends Record<string, Providers> = Record<
		string,
		Providers
	>,
> = (
	input: TInput,
	ctx: HandlerContext<TTablesSchema, TKvSchema, TProviderExports>,
) => TOutput | Promise<TOutput>;

type InferInput<TInput> = TInput extends StandardSchemaV1
	? StandardSchemaV1.InferOutput<TInput>
	: undefined;

type InferOutput<TOutput> = TOutput extends StandardSchemaV1
	? StandardSchemaV1.InferOutput<TOutput>
	: never;

export type HandlersForContracts<
	TActions extends ActionContracts,
	TTablesSchema extends TablesSchema,
	TKvSchema extends KvSchema,
	TProviderExports extends Record<string, Providers>,
> = {
	[K in keyof TActions]: TActions[K] extends QueryContract<
		infer TInput,
		infer TOutput
	>
		? HandlerFn<
				InferInput<TInput>,
				InferOutput<TOutput>,
				TTablesSchema,
				TKvSchema,
				TProviderExports
			>
		: TActions[K] extends MutationContract<infer TInput, infer TOutput>
			? HandlerFn<
					InferInput<TInput>,
					InferOutput<TOutput>,
					TTablesSchema,
					TKvSchema,
					TProviderExports
				>
			: TActions[K] extends ActionContracts
				? HandlersForContracts<
						TActions[K],
						TTablesSchema,
						TKvSchema,
						TProviderExports
					>
				: never;
};

export type CreateOptions = {
	projectDir?: string;
};

export type BoundAction<TInput, TOutput> = TInput extends undefined
	? () => Promise<TOutput>
	: (input: TInput) => Promise<TOutput>;

export type BoundActions<TActions extends ActionContracts> = {
	[K in keyof TActions]: TActions[K] extends QueryContract<
		infer TInput,
		infer TOutput
	>
		? BoundAction<InferInput<TInput>, InferOutput<TOutput>>
		: TActions[K] extends MutationContract<infer TInput, infer TOutput>
			? BoundAction<InferInput<TInput>, InferOutput<TOutput>>
			: TActions[K] extends ActionContracts
				? BoundActions<TActions[K]>
				: never;
};

/**
 * A bound workspace client with actions, tables, kv, and providers.
 *
 * - Actions are namespaced under `.actions` for clarity
 * - Tables provide YJS-backed CRUD operations
 * - KV provides YJS-backed key-value storage
 * - Providers expose capabilities like SQLite queries
 */
export type BoundWorkspaceClient<
	TId extends string = string,
	TActions extends ActionContracts = ActionContracts,
	TTablesSchema extends TablesSchema = TablesSchema,
	TKvSchema extends KvSchema = KvSchema,
	TProviders extends ProviderMap<TTablesSchema, TKvSchema> = ProviderMap<
		TTablesSchema,
		TKvSchema
	>,
> = {
	/** The workspace ID from the contract definition */
	id: TId;
	/** The action contracts (for server route registration) */
	contracts: TActions;
	/** YJS-backed table operations */
	tables: Tables<TTablesSchema>;
	/** YJS-backed key-value storage */
	kv: Kv<TKvSchema>;
	/** Provider exports (SQLite, markdown, etc.) */
	providers: InferProviderExports<TProviders>;
	/** Filesystem paths (undefined in browser) */
	paths: WorkspacePaths | undefined;
	/** The underlying YJS document */
	ydoc: Y.Doc;
	/** Bound action methods */
	actions: BoundActions<TActions>;
	/** Clean up resources (providers, YDoc) */
	destroy(): Promise<void>;
	/** Async dispose for `await using` syntax */
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

async function initializeWorkspace<
	TId extends string,
	TTablesSchema extends TablesSchema,
	TKvSchema extends KvSchema,
	TProviders extends ProviderMap<TTablesSchema, TKvSchema>,
>(
	config: WorkspaceContract<TId, TTablesSchema, TKvSchema, ActionContracts>,
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

function bindActionsWithHandlers<
	TActions extends ActionContracts,
	TTablesSchema extends TablesSchema,
	TKvSchema extends KvSchema,
	TProviderExports extends Record<string, Providers>,
>(
	contracts: TActions,
	handlers: HandlersForContracts<
		TActions,
		TTablesSchema,
		TKvSchema,
		TProviderExports
	>,
	ctx: HandlerContext<TTablesSchema, TKvSchema, TProviderExports>,
): BoundActions<TActions> {
	const bound: Record<string, unknown> = {};

	for (const [key, contractOrNamespace] of Object.entries(contracts)) {
		const handlerOrNamespace = (handlers as Record<string, unknown>)[key];

		if (isActionContract(contractOrNamespace)) {
			const handler = handlerOrNamespace as (
				input: unknown,
				ctx: HandlerContext<TTablesSchema, TKvSchema, TProviderExports>,
			) => unknown | Promise<unknown>;

			bound[key] = async (input: unknown) => handler(input, ctx);
		} else {
			bound[key] = bindActionsWithHandlers(
				contractOrNamespace as ActionContracts,
				handlerOrNamespace as HandlersForContracts<
					ActionContracts,
					TTablesSchema,
					TKvSchema,
					TProviderExports
				>,
				ctx,
			);
		}
	}

	return bound as BoundActions<TActions>;
}

function bindActionsWithHttp<TActions extends ActionContracts>(
	contracts: TActions,
	baseUrl: string,
	workspaceId: string,
	path: string[] = [],
): BoundActions<TActions> {
	const bound: Record<string, unknown> = {};

	for (const [key, contractOrNamespace] of Object.entries(contracts)) {
		const actionPath = [...path, key];

		if (isActionContract(contractOrNamespace)) {
			const contract = contractOrNamespace;
			const endpoint = `${baseUrl}/workspaces/${workspaceId}/actions/${actionPath.join('/')}`;

			bound[key] = async (input: unknown) => {
				const method = contract.type === 'query' ? 'GET' : 'POST';

				if (method === 'GET') {
					const params = input
						? new URLSearchParams(input as Record<string, string>).toString()
						: '';
					const url = params ? `${endpoint}?${params}` : endpoint;
					const response = await fetch(url);
					return response.json();
				}

				const response = await fetch(endpoint, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(input),
				});
				return response.json();
			};
		} else {
			bound[key] = bindActionsWithHttp(
				contractOrNamespace as ActionContracts,
				baseUrl,
				workspaceId,
				actionPath,
			);
		}
	}

	return bound as BoundActions<TActions>;
}

/**
 * Define a workspace from a JSON-serializable contract.
 *
 * @param config - A `WorkspaceContract` (JSON-serializable data defining tables and actions)
 * @returns A `Workspace` object with fluent methods (`.withProviders()`, `.createWithHandlers()`, etc.)
 *
 * @example
 * ```typescript
 * const blogWorkspace = defineWorkspace({
 *   id: 'blog',
 *   tables: {
 *     posts: { id: id(), title: text(), published: boolean({ default: false }) },
 *   },
 *   actions: {
 *     publishPost: defineMutation({
 *       input: type({ id: 'string' }),
 *       output: type({ success: 'boolean' }),
 *     }),
 *   },
 * });
 *
 * // Server: create client with handlers
 * const client = await blogWorkspace
 *   .withProviders({ sqlite: sqliteProvider })
 *   .createWithHandlers({
 *     publishPost: async (input, ctx) => {
 *       ctx.tables.posts.update({ id: input.id, published: true });
 *       return { success: true };
 *     },
 *   });
 *
 * // Browser: create HTTP client
 * const client = await blogWorkspace
 *   .withProviders({ indexeddb: idbProvider })
 *   .createHttpClient('http://localhost:3913');
 * ```
 */
export function defineWorkspace<
	const TId extends string,
	TTablesSchema extends TablesSchema,
	TKvSchema extends KvSchema = Record<string, never>,
	TActions extends ActionContracts = ActionContracts,
>(
	config: WorkspaceContract<TId, TTablesSchema, TKvSchema, TActions>,
): Workspace<TId, TTablesSchema, TKvSchema, TActions> {
	if (!config.id || typeof config.id !== 'string') {
		throw new Error('Workspace must have a valid string ID');
	}

	const createClientWithHandlers = async <
		TProviders extends ProviderMap<TTablesSchema, TKvSchema>,
	>(
		providers: TProviders,
		handlers: HandlersForContracts<
			TActions,
			TTablesSchema,
			TKvSchema,
			InferProviderExports<TProviders>
		>,
		options?: CreateOptions,
	): Promise<
		BoundWorkspaceClient<TId, TActions, TTablesSchema, TKvSchema, TProviders>
	> => {
		const { ydoc, tables, kv, providerExports, paths, cleanup } =
			await initializeWorkspace(config, providers, options);

		const handlerContext: HandlerContext<
			TTablesSchema,
			TKvSchema,
			InferProviderExports<TProviders>
		> = {
			tables,
			kv,
			providers: providerExports,
			paths,
		};

		const boundActions = bindActionsWithHandlers(
			config.actions,
			handlers,
			handlerContext,
		);

		return {
			id: config.id,
			contracts: config.actions,
			ydoc: ydoc,
			tables: tables,
			kv: kv,
			providers: providerExports,
			paths: paths,
			actions: boundActions,
			destroy: cleanup,
			[Symbol.asyncDispose]: cleanup,
		};
	};

	const createClientWithHttp = async <
		TProviders extends ProviderMap<TTablesSchema, TKvSchema>,
	>(
		providers: TProviders,
		url: string,
		options?: CreateOptions,
	): Promise<
		BoundWorkspaceClient<TId, TActions, TTablesSchema, TKvSchema, TProviders>
	> => {
		const { ydoc, tables, kv, providerExports, paths, cleanup } =
			await initializeWorkspace(config, providers, options);

		const boundActions = bindActionsWithHttp(config.actions, url, config.id);

		return {
			id: config.id,
			contracts: config.actions,
			ydoc: ydoc,
			tables: tables,
			kv: kv,
			providers: providerExports,
			paths: paths,
			actions: boundActions,
			destroy: cleanup,
			[Symbol.asyncDispose]: cleanup,
		};
	};

	return {
		...config,

		withProviders<TProviders extends ProviderMap<TTablesSchema, TKvSchema>>(
			providers: TProviders,
		): WorkspaceWithProviders<
			TId,
			TTablesSchema,
			TKvSchema,
			TActions,
			TProviders
		> {
			return {
				...config,
				$providers: providers,

				createWithHandlers(
					handlers: HandlersForContracts<
						TActions,
						TTablesSchema,
						TKvSchema,
						InferProviderExports<TProviders>
					>,
					options?: CreateOptions,
				): Promise<
					BoundWorkspaceClient<
						TId,
						TActions,
						TTablesSchema,
						TKvSchema,
						TProviders
					>
				> {
					return createClientWithHandlers(providers, handlers, options);
				},

				createHttpClient(
					url: string,
					options?: CreateOptions,
				): Promise<
					BoundWorkspaceClient<
						TId,
						TActions,
						TTablesSchema,
						TKvSchema,
						TProviders
					>
				> {
					return createClientWithHttp(providers, url, options);
				},
			};
		},

		createWithHandlers(
			handlers: HandlersForContracts<
				TActions,
				TTablesSchema,
				TKvSchema,
				Record<string, never>
			>,
			options?: CreateOptions,
		): Promise<
			BoundWorkspaceClient<
				TId,
				TActions,
				TTablesSchema,
				TKvSchema,
				Record<string, never>
			>
		> {
			const emptyProviders = {} as Record<string, never>;
			return createClientWithHandlers(
				emptyProviders,
				handlers as HandlersForContracts<
					TActions,
					TTablesSchema,
					TKvSchema,
					InferProviderExports<Record<string, never>>
				>,
				options,
			);
		},

		createHttpClient(
			url: string,
			options?: CreateOptions,
		): Promise<
			BoundWorkspaceClient<
				TId,
				TActions,
				TTablesSchema,
				TKvSchema,
				Record<string, never>
			>
		> {
			const emptyProviders = {} as Record<string, never>;
			return createClientWithHttp(emptyProviders, url, options);
		},
	};
}
