import * as Y from 'yjs';

import { createTables, type Tables } from '../tables/create-tables';
import { createKv, type Kv } from '../kv/core';
import type {
	CapabilityExports,
	CapabilityMap,
	InferCapabilityExports,
} from '../capability';
import type { KvSchema, TablesSchema, TablesWithMetadata } from '../schema';

/**
 * A workspace schema defines the pure data shape of a workspace.
 *
 * This type is fully JSON-serializable and contains no methods or runtime behavior.
 * It represents the configuration passed to `defineWorkspace()`.
 *
 * Use `defineWorkspace()` to create a `Workspace` object with a `.create()` method.
 */
export type WorkspaceSchema<
	TId extends string = string,
	TTablesSchema extends TablesSchema | TablesWithMetadata =
		| TablesSchema
		| TablesWithMetadata,
	TKvSchema extends KvSchema = KvSchema,
> = {
	/** Globally unique identifier for sync coordination. Generate with `generateGuid()`. */
	guid: string;
	/** Human-readable slug for URLs, paths, and CLI commands. */
	id: TId;
	/** Display name shown in UI. */
	name: string;
	/** Table definitions with metadata. */
	tables: TTablesSchema;
	/** Key-value store schema. */
	kv: TKvSchema;
};

/**
 * A workspace object returned by `defineWorkspace()`.
 *
 * Contains the schema (tables, kv, id, guid) and a `.create()` method
 * to instantiate a runtime client.
 *
 * @example No capabilities (ephemeral, in-memory)
 * ```typescript
 * const client = await workspace.create();
 * ```
 *
 * @example With capabilities
 * ```typescript
 * const client = await workspace.create({ sqlite, persistence });
 * ```
 *
 * @example Capabilities with options
 * ```typescript
 * const client = await workspace.create({
 *   sqlite: sqlite({ debounceMs: 50 }),
 *   persistence,
 * });
 * ```
 */
export type Workspace<
	TId extends string = string,
	TTablesSchema extends TablesSchema = TablesSchema,
	TKvSchema extends KvSchema = KvSchema,
> = WorkspaceSchema<TId, TTablesSchema, TKvSchema> & {
	/**
	 * Create a workspace client.
	 *
	 * @param capabilities - Optional capability factories to attach.
	 *   Capabilities add functionality like persistence, sync, or SQL queries.
	 *   Each capability receives context and can return exports accessible
	 *   via `client.capabilities.{name}`.
	 *
	 * @example No capabilities (ephemeral, in-memory)
	 * ```typescript
	 * const client = await workspace.create();
	 * ```
	 *
	 * @example With capabilities
	 * ```typescript
	 * const client = await workspace.create({ sqlite, persistence });
	 * ```
	 *
	 * @example Capabilities with options
	 * ```typescript
	 * const client = await workspace.create({
	 *   sqlite: sqlite({ debounceMs: 50 }),
	 *   persistence,
	 * });
	 * ```
	 */
	create<TCapabilities extends CapabilityMap<TTablesSchema, TKvSchema> = {}>(
		capabilities?: TCapabilities,
	): Promise<WorkspaceClient<TId, TTablesSchema, TKvSchema, TCapabilities>>;
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
): Promise<InitializedWorkspace<TTablesSchema, TKvSchema, TCapabilities>> {
	const ydoc = new Y.Doc({ guid: `${config.guid}:0` });
	const tables = createTables(ydoc, config.tables);
	const kv = createKv(ydoc, config.kv);

	const capabilityExports = Object.fromEntries(
		await Promise.all(
			Object.entries(capabilityFactories).map(
				async ([capabilityId, capabilityFn]) => {
					const result = await capabilityFn({
						id: config.id,
						capabilityId,
						ydoc,
						tables,
						kv,
					});
					return [capabilityId, result ?? {}];
				},
			),
		),
	) as InferCapabilityExports<TCapabilities>;

	const cleanup = async () => {
		await Promise.all(
			Object.values(capabilityExports).map((capability) =>
				(capability as CapabilityExports).destroy?.(),
			),
		);
		ydoc.destroy();
	};

	return {
		ydoc,
		tables,
		kv,
		capabilityExports,
		cleanup,
	};
}

/**
 * Define a collaborative workspace with YJS-first architecture.
 *
 * A workspace is a self-contained domain module with tables and capabilities.
 *
 * @example
 * ```typescript
 * const workspace = defineWorkspace({
 *   id: 'blog',
 *   name: 'Blog',
 *   guid: generateGuid(),
 *   tables: {
 *     posts: { id: id(), title: text(), published: boolean({ default: false }) },
 *   },
 *   kv: {},
 * });
 *
 * // Create client with capabilities
 * const client = await workspace.create({ sqlite, persistence });
 *
 * // Or without capabilities (ephemeral, in-memory)
 * const client = await workspace.create();
 *
 * // Use the client directly
 * client.tables.posts.upsert({ id: generateId(), title: 'Hello', published: false });
 * const posts = client.tables.posts.getAllValid();
 *
 * // Clean up when done
 * await client.destroy();
 * ```
 *
 * @param config - Workspace configuration (id, name, guid, tables, kv)
 * @returns A Workspace object with a `.create()` method
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

		async create<
			TCapabilities extends CapabilityMap<TTablesSchema, TKvSchema> = {},
		>(
			capabilities?: TCapabilities,
		): Promise<WorkspaceClient<TId, TTablesSchema, TKvSchema, TCapabilities>> {
			const { ydoc, tables, kv, capabilityExports, cleanup } =
				await initializeWorkspace(
					config,
					(capabilities ?? {}) as TCapabilities,
				);

			return {
				guid: config.guid,
				id: config.id,
				ydoc,
				tables,
				kv,
				capabilities: capabilityExports,
				destroy: cleanup,
				[Symbol.asyncDispose]: cleanup,
			};
		},
	};
}
