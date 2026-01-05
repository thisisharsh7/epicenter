import * as Y from 'yjs';

import { createTables, type Tables } from '../tables/core';
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
	name: string;
	description?: string;
	tables: TTablesSchema;
	kv: TKvSchema;
};

/**
 * A map of provider factory functions keyed by provider ID.
 *
 * Providers add capabilities to workspaces: persistence, sync, SQL queries, etc.
 * Each provider receives context and optionally returns exports accessible via
 * `client.providers[providerId]`.
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
 *   .create();
 *
 * // Use the client directly
 * client.tables.posts.upsert({ id: '1', title: 'Hello' });
 * const posts = client.tables.posts.getAllValid();
 *
 * // Write functions that use the client
 * function createPost(title: string) {
 *   const id = generateId();
 *   client.tables.posts.upsert({ id, title });
 *   return { id };
 * }
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
};

/**
 * A workspace with providers attached, ready to create a client.
 *
 * Call `.create()` to initialize providers and get a fully functional workspace client.
 */
export type WorkspaceWithProviders<
	TId extends string,
	TTablesSchema extends TablesSchema,
	TKvSchema extends KvSchema,
	TProviders extends ProviderMap<TTablesSchema, TKvSchema>,
> = WorkspaceSchema<TId, TTablesSchema, TKvSchema> & {
	/** Internal: provider factories (not yet initialized). */
	$providers: TProviders;

	/**
	 * Initialize providers and create a workspace client.
	 *
	 * This is the final step that:
	 * 1. Creates a YJS document with the workspace ID as GUID
	 * 2. Initializes all providers in parallel
	 * 3. Returns a client with table/kv accessors and provider exports
	 */
	create(
		options?: CreateOptions,
	): Promise<WorkspaceClient<TId, TTablesSchema, TKvSchema, TProviders>>;
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
 * A fully initialized workspace client.
 *
 * This is the main interface for interacting with a workspace:
 * - Access tables via `client.tables.tableName.get/upsert/etc.`
 * - Access kv store via `client.kv.key.get/set/etc.`
 * - Access provider exports via `client.providers.providerId`
 * - Access the underlying YJS document via `client.ydoc`
 *
 * Write functions that use the client to compose your own "actions":
 *
 * ```typescript
 * const client = await workspace.create();
 *
 * // Your own functions that use the client
 * function createPost(title: string) {
 *   const id = generateId();
 *   client.tables.posts.upsert({ id, title, published: false });
 *   return { id };
 * }
 *
 * function getAllPosts() {
 *   return client.tables.posts.getAllValid();
 * }
 *
 * // Expose via HTTP, MCP, CLI however you want
 * ```
 *
 * Supports `await using` for automatic cleanup:
 * ```typescript
 * {
 *   await using client = await workspace.create();
 *   client.tables.posts.upsert({ id: '1', title: 'Hello' });
 * } // Automatically cleaned up here
 * ```
 */
export type WorkspaceClient<
	TId extends string = string,
	TTablesSchema extends TablesSchema = TablesSchema,
	TKvSchema extends KvSchema = KvSchema,
	TProviders extends ProviderMap<TTablesSchema, TKvSchema> = ProviderMap<
		TTablesSchema,
		TKvSchema
	>,
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
 * 4. Returns everything needed to construct a WorkspaceClient
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
	const kv = createKv(ydoc, config.kv);

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
 * Define a collaborative workspace with YJS-first architecture.
 *
 * A workspace is a self-contained domain module with tables and providers.
 * Use the fluent chaining API to configure and create a client:
 *
 * @example
 * ```typescript
 * const workspace = defineWorkspace({
 *   id: 'blog',
 *   name: 'Blog',
 *   tables: {
 *     posts: { id: id(), title: text(), published: boolean({ default: false }) },
 *   },
 *   kv: {},
 * });
 *
 * const client = await workspace
 *   .withProviders({ sqlite: sqliteProvider })
 *   .create();
 *
 * // Use the client directly
 * client.tables.posts.upsert({ id: generateId(), title: 'Hello', published: false });
 * const posts = client.tables.posts.getAllValid();
 *
 * // Or write functions that use the client
 * function createPost(title: string) {
 *   const id = generateId();
 *   client.tables.posts.upsert({ id, title, published: false });
 *   return { id };
 * }
 *
 * // Expose via HTTP, MCP, CLI however you want
 * app.post('/posts', (req) => createPost(req.body.title));
 *
 * // Clean up when done
 * await client.destroy();
 * ```
 *
 * @param config - Workspace configuration (id, name, tables, kv, optional description)
 * @returns A Workspace object with fluent methods for adding providers
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

				async create(
					options?: CreateOptions,
				): Promise<WorkspaceClient<TId, TTablesSchema, TKvSchema, TProviders>> {
					const { ydoc, tables, kv, providerExports, paths, cleanup } =
						await initializeWorkspace(config, providers, options);

					return {
						id: config.id,
						ydoc,
						tables,
						kv,
						providers: providerExports,
						paths,
						destroy: cleanup,
						[Symbol.asyncDispose]: cleanup,
					};
				},
			};
		},
	};
}
