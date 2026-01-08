import type * as Y from 'yjs';

import { createTables, type Tables } from '../tables/create-tables';
import { createKv, type Kv } from '../kv/core';
import { createDataDoc, type DataDoc } from '../docs';
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
	TTablesSchema extends TablesSchema | TablesWithMetadata =
		| TablesSchema
		| TablesWithMetadata,
	TKvSchema extends KvSchema = KvSchema,
> = {
	/** Globally unique identifier for sync coordination. Generate with `generateGuid()`. */
	id: string;
	/** Human-readable slug for URLs, paths, and CLI commands. */
	slug: string;
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
 * Contains the schema (tables, kv, id, slug) and a `.create()` method
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
	TTablesSchema extends TablesSchema = TablesSchema,
	TKvSchema extends KvSchema = KvSchema,
> = WorkspaceSchema<TTablesSchema, TKvSchema> & {
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
	): Promise<WorkspaceClient<TTablesSchema, TKvSchema, TCapabilities>>;
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
 *   const rowId = generateId();
 *   client.tables.posts.upsert({ id: rowId, title, published: false });
 *   return { id: rowId };
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
	TTablesSchema extends TablesSchema = TablesSchema,
	TKvSchema extends KvSchema = KvSchema,
	TCapabilities extends CapabilityMap<TTablesSchema, TKvSchema> = CapabilityMap<
		TTablesSchema,
		TKvSchema
	>,
> = {
	/** Globally unique identifier for sync coordination. */
	id: string;
	/** Human-readable slug for URLs, paths, and CLI commands. */
	slug: string;
	/** Typed table helpers for CRUD operations. */
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
	dataDoc: DataDoc;
	tables: Tables<TTablesSchema>;
	kv: Kv<TKvSchema>;
	capabilityExports: InferCapabilityExports<TCapabilities>;
	cleanup: () => Promise<void>;
};

/**
 * Normalize tables schema to plain field schemas (strip table metadata if present).
 *
 * Tables can be defined with or without metadata:
 * - Simple: `{ posts: { id: id(), title: text() } }`
 * - With metadata: `{ posts: { name: 'Posts', fields: { id: id(), title: text() } } }`
 *
 * This function extracts just the field schemas for seeding.
 */
function normalizeTablesForSeeding(
	tables: TablesSchema | TablesWithMetadata,
): TablesSchema {
	const result: TablesSchema = {};
	for (const [tableName, tableValue] of Object.entries(tables)) {
		// Check if this is a TableDefinition (has 'fields' property with 'id' inside)
		if (
			'fields' in tableValue &&
			typeof tableValue.fields === 'object' &&
			tableValue.fields !== null &&
			'id' in tableValue.fields
		) {
			result[tableName] = tableValue.fields;
		} else {
			// It's already a plain TableSchema
			result[tableName] = tableValue as TablesSchema[string];
		}
	}
	return result;
}

/**
 * Initialize a workspace: create Data Y.Doc, seed schema, tables, kv, and run capability factories.
 *
 * This is an internal function called by `.create()`. It:
 * 1. Creates a Data Y.Doc with `{id}-{epoch}` as the doc GUID (epoch 0 for initial)
 * 2. Seeds the Y.Doc schema from code-defined schema (if not already seeded)
 * 3. Creates typed table and kv helpers backed by the Y.Doc
 * 4. Runs all capability factories in parallel
 * 5. Returns everything needed to construct a WorkspaceClient
 *
 * The Data Y.Doc contains both schema and data. Schema is seeded once from the
 * code-defined schema, then becomes the runtime source of truth for validation.
 * TypeScript types always come from the code schema (compile-time).
 */
async function initializeWorkspace<
	TTablesSchema extends TablesSchema,
	TKvSchema extends KvSchema,
	TCapabilities extends CapabilityMap<TTablesSchema, TKvSchema>,
>(
	config: WorkspaceSchema<TTablesSchema, TKvSchema>,
	capabilityFactories: TCapabilities,
): Promise<InitializedWorkspace<TTablesSchema, TKvSchema, TCapabilities>> {
	// Create Data Y.Doc (epoch 0 for now, will be read from Head Y.Doc in future)
	const dataDoc = createDataDoc({
		workspaceId: config.id,
		epoch: 0,
	});

	// Set workspace name (only if not already set)
	if (!dataDoc.getName()) {
		dataDoc.setName(config.name);
	}

	// Merge code schema into Y.Doc schema (idempotent, CRDT handles conflicts)
	const normalizedTables = normalizeTablesForSeeding(config.tables);
	dataDoc.mergeSchema(normalizedTables, config.kv);

	// Create table and kv helpers using the Data Y.Doc
	const tables = createTables(dataDoc.ydoc, config.tables);
	const kv = createKv(dataDoc.ydoc, config.kv);

	const capabilityExports = Object.fromEntries(
		await Promise.all(
			Object.entries(capabilityFactories).map(
				async ([capabilityId, capabilityFn]) => {
					const result = await capabilityFn({
						id: config.slug,
						capabilityId,
						ydoc: dataDoc.ydoc,
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
		dataDoc.destroy();
	};

	return {
		dataDoc,
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
 *   id: generateGuid(),
 *   slug: 'blog',
 *   name: 'Blog',
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
 * @param config - Workspace configuration (id, slug, name, tables, kv)
 * @returns A Workspace object with a `.create()` method
 */
export function defineWorkspace<
	TTablesSchema extends TablesSchema,
	TKvSchema extends KvSchema = Record<string, never>,
>(
	config: WorkspaceSchema<TTablesSchema, TKvSchema>,
): Workspace<TTablesSchema, TKvSchema> {
	if (!config.id || typeof config.id !== 'string') {
		throw new Error('Workspace must have a valid ID');
	}
	if (!config.slug || typeof config.slug !== 'string') {
		throw new Error('Workspace must have a valid slug');
	}

	return {
		...config,

		async create<
			TCapabilities extends CapabilityMap<TTablesSchema, TKvSchema> = {},
		>(
			capabilities?: TCapabilities,
		): Promise<WorkspaceClient<TTablesSchema, TKvSchema, TCapabilities>> {
			const { dataDoc, tables, kv, capabilityExports, cleanup } =
				await initializeWorkspace(
					config,
					(capabilities ?? {}) as TCapabilities,
				);

			return {
				id: config.id,
				slug: config.slug,
				ydoc: dataDoc.ydoc,
				tables,
				kv,
				capabilities: capabilityExports,
				destroy: cleanup,
				[Symbol.asyncDispose]: cleanup,
			};
		},
	};
}
