import * as Y from 'yjs';

import { createTables, type Tables } from '../tables/create-tables';
import { createKv, type Kv } from '../kv/core';
import type { Capabilities, Capability } from '../provider.shared';
import type { KvSchema, TablesSchema } from '../schema';
import type { ProviderPaths, WorkspacePaths } from '../types';

/**
 * A workspace schema defines the pure data shape of a workspace.
 *
 * This type is fully JSON-serializable and contains no methods or runtime behavior.
 * It represents the configuration passed to `defineWorkspace()`.
 *
 * Use `defineWorkspace()` to create a `Workspace` object that adds fluent methods
 * like `.withCapabilities()` for creating runnable clients.
 */
export type WorkspaceSchema<
	TId extends string = string,
	TTablesSchema extends TablesSchema = TablesSchema,
	TKvSchema extends KvSchema = KvSchema,
> = {
	/** Globally unique identifier for sync coordination. Generate with `generateGuid()`. */
	guid: string;
	/** Human-readable slug for URLs, paths, and CLI commands. */
	id: TId;
	/** Display name shown in UI. */
	name: string;
	/** Emoji icon for the workspace. */
	emoji: string;
	/** Description of the workspace. */
	description: string;
	/** Table definitions with metadata. */
	tables: TTablesSchema;
	/** Key-value store schema. */
	kv: TKvSchema;
};

/**
 * A map of capability factory functions keyed by capability ID.
 *
 * Capabilities add functionality to workspaces: persistence, sync, SQL queries, etc.
 * Each capability receives context and optionally returns exports accessible via
 * `client.capabilities[capabilityId]`.
 */
export type CapabilityMap<
	TTablesSchema extends TablesSchema = TablesSchema,
	TKvSchema extends KvSchema = KvSchema,
> = Record<string, Capability<TTablesSchema, TKvSchema>>;

/**
 * Utility type to infer the exports from a capability map.
 *
 * Maps each capability key to its return type (unwrapped from Promise if async).
 * Capabilities that return void produce empty objects.
 */
export type InferCapabilityExports<TCapabilities> = {
	[K in keyof TCapabilities]: TCapabilities[K] extends Capability<
		TablesSchema,
		KvSchema,
		infer TExports
	>
		? TExports extends Capabilities
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
 *   .withCapabilities({ sqlite: sqliteProvider })
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
	/** Add capabilities (SQLite, IndexedDB, markdown, sync, etc.) to the workspace. */
	withCapabilities<
		TCapabilities extends CapabilityMap<TTablesSchema, TKvSchema>,
	>(
		capabilities: TCapabilities,
	): WorkspaceWithCapabilities<TId, TTablesSchema, TKvSchema, TCapabilities>;
};

/**
 * A workspace with capabilities attached, ready to create a client.
 *
 * Call `.create()` to initialize capabilities and get a fully functional workspace client.
 */
export type WorkspaceWithCapabilities<
	TId extends string,
	TTablesSchema extends TablesSchema,
	TKvSchema extends KvSchema,
	TCapabilities extends CapabilityMap<TTablesSchema, TKvSchema>,
> = WorkspaceSchema<TId, TTablesSchema, TKvSchema> & {
	/** Internal: capability factories (not yet initialized). */
	$capabilities: TCapabilities;

	/**
	 * Initialize capabilities and create a workspace client.
	 *
	 * This is the final step that:
	 * 1. Creates a YJS document with the workspace ID as GUID
	 * 2. Initializes all capabilities in parallel
	 * 3. Returns a client with table/kv accessors and capability exports
	 */
	create(
		options?: CreateOptions,
	): Promise<WorkspaceClient<TId, TTablesSchema, TKvSchema, TCapabilities>>;
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
 * - Access capability exports via `client.capabilities.capabilityId`
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
	TCapabilities extends CapabilityMap<TTablesSchema, TKvSchema> = CapabilityMap<
		TTablesSchema,
		TKvSchema
	>,
> = {
	guid: string;
	id: TId;
	tables: Tables<TTablesSchema>;
	/** Key-value store for simple values. */
	kv: Kv<TKvSchema>;
	/** Exports from initialized capabilities. */
	capabilities: InferCapabilityExports<TCapabilities>;
	/** Filesystem paths (undefined in browser). */
	paths: WorkspacePaths | undefined;
	/** The underlying YJS document. */
	ydoc: Y.Doc;
	/** Clean up resources (close capabilities, destroy YJS doc). */
	destroy(): Promise<void>;
	/** Symbol.asyncDispose for `await using` support. */
	[Symbol.asyncDispose](): Promise<void>;
};

type InitializedWorkspace<
	TTablesSchema extends TablesSchema,
	TKvSchema extends KvSchema,
	TCapabilities extends CapabilityMap<TTablesSchema, TKvSchema>,
> = {
	ydoc: Y.Doc;
	tables: Tables<TTablesSchema>;
	kv: Kv<TKvSchema>;
	capabilityExports: InferCapabilityExports<TCapabilities>;
	paths: WorkspacePaths | undefined;
	cleanup: () => Promise<void>;
};

/**
 * Initialize a workspace: create YJS doc, tables, kv, and run capability factories.
 *
 * This is an internal function called by `.create()`. It:
 * 1. Creates a YJS document with `{guid}:0` as the doc GUID (epoch 0, reserved for future epoch support)
 * 2. Creates typed table and kv helpers backed by the YJS doc
 * 3. Runs all capability factories in parallel
 * 4. Returns everything needed to construct a WorkspaceClient
 */
async function initializeWorkspace<
	TId extends string,
	TTablesSchema extends TablesSchema,
	TKvSchema extends KvSchema,
	TCapabilities extends CapabilityMap<TTablesSchema, TKvSchema>,
>(
	config: WorkspaceSchema<TId, TTablesSchema, TKvSchema>,
	capabilityFactories: TCapabilities,
	options?: CreateOptions,
): Promise<InitializedWorkspace<TTablesSchema, TKvSchema, TCapabilities>> {
	const projectDir =
		options?.projectDir ??
		(typeof process !== 'undefined' ? process.cwd() : undefined);

	const ydoc = new Y.Doc({ guid: `${config.guid}:0` });
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

	const capabilityExports = Object.fromEntries(
		await Promise.all(
			Object.entries(capabilityFactories).map(
				async ([capabilityId, capabilityFn]) => {
					const paths: ProviderPaths | undefined =
						projectDir && buildProviderPaths
							? buildProviderPaths(projectDir, capabilityId)
							: undefined;

					const result = await capabilityFn({
						id: config.id,
						capabilityId,
						ydoc,
						tables,
						kv,
						paths,
					});
					return [capabilityId, result ?? {}];
				},
			),
		),
	) as InferCapabilityExports<TCapabilities>;

	const workspacePaths: WorkspacePaths | undefined =
		projectDir && getEpicenterDir
			? {
					project: projectDir as WorkspacePaths['project'],
					epicenter: getEpicenterDir(projectDir) as WorkspacePaths['epicenter'],
				}
			: undefined;

	const cleanup = async () => {
		await Promise.all(
			Object.values(capabilityExports).map((capability) =>
				(capability as Capabilities).destroy?.(),
			),
		);
		ydoc.destroy();
	};

	return {
		ydoc,
		tables,
		kv,
		capabilityExports,
		paths: workspacePaths,
		cleanup,
	};
}

/**
 * Define a collaborative workspace with YJS-first architecture.
 *
 * A workspace is a self-contained domain module with tables and capabilities.
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
 *   .withCapabilities({ sqlite: sqliteProvider })
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
 * @returns A Workspace object with fluent methods for adding capabilities
 */
export function defineWorkspace<
	const TId extends string,
	TTablesSchema extends TablesSchema,
	TKvSchema extends KvSchema = Record<string, never>,
>(
	config: WorkspaceSchema<TId, TTablesSchema, TKvSchema>,
): Workspace<TId, TTablesSchema, TKvSchema> {
	if (!config.guid || typeof config.guid !== 'string') {
		throw new Error('Workspace must have a valid GUID');
	}
	if (!config.id || typeof config.id !== 'string') {
		throw new Error('Workspace must have a valid string ID');
	}

	return {
		...config,

		withCapabilities<
			TCapabilities extends CapabilityMap<TTablesSchema, TKvSchema>,
		>(
			capabilities: TCapabilities,
		): WorkspaceWithCapabilities<TId, TTablesSchema, TKvSchema, TCapabilities> {
			return {
				...config,
				$capabilities: capabilities,

				async create(
					options?: CreateOptions,
				): Promise<
					WorkspaceClient<TId, TTablesSchema, TKvSchema, TCapabilities>
				> {
					const { ydoc, tables, kv, capabilityExports, paths, cleanup } =
						await initializeWorkspace(config, capabilities, options);

					return {
						guid: config.guid,
						id: config.id,
						ydoc,
						tables,
						kv,
						capabilities: capabilityExports,
						paths,
						destroy: cleanup,
						[Symbol.asyncDispose]: cleanup,
					};
				},
			};
		},
	};
}
