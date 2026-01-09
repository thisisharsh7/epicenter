import { Value } from 'typebox/value';
import * as Y from 'yjs';
import type {
	CapabilityExports,
	CapabilityFactoryMap,
	InferCapabilityExports,
} from '../capability';
import { createKv, type Kv } from '../kv/core';
import type { KvSchema, TableDefinitionMap } from '../schema';
import type {
	CoverDefinition,
	FieldSchema,
	IconDefinition,
} from '../schema/fields/types';
import { createTables, type Tables } from '../tables/create-tables';

// ─────────────────────────────────────────────────────────────────────────────
// Public API: Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A workspace schema defines the pure data shape of a workspace.
 *
 * This type is fully JSON-serializable and contains no methods or runtime behavior.
 * It represents the configuration passed to `defineWorkspace()`.
 *
 * Use `defineWorkspace()` to create a `Workspace` object with a `.create()` method.
 */
export type WorkspaceSchema<
	TTableDefinitionMap extends TableDefinitionMap = TableDefinitionMap,
	TKvSchema extends KvSchema = KvSchema,
> = {
	/** Globally unique identifier for sync coordination. Generate with `generateGuid()`. */
	id: string;
	/** Human-readable slug for URLs, paths, and CLI commands. */
	slug: string;
	/** Display name shown in UI. */
	name: string;
	/**
	 * Table definitions with metadata (name, icon, cover, description, fields).
	 *
	 * @example
	 * ```typescript
	 * tables: {
	 *   posts: {
	 *     name: 'Posts',
	 *     icon: { type: 'emoji', value: '📝' },
	 *     cover: null,
	 *     description: 'Blog posts',
	 *     fields: { id: id(), title: text() },
	 *   },
	 * }
	 * ```
	 */
	tables: TTableDefinitionMap;
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
 * const client = await workspace.create({
 *   capabilities: { sqlite, persistence },
 * });
 * ```
 *
 * @example Capabilities with options
 * ```typescript
 * const client = await workspace.create({
 *   capabilities: {
 *     sqlite: sqlite({ debounceMs: 50 }),
 *     persistence,
 *   },
 * });
 * ```
 */
export type Workspace<
	TTableDefinitionMap extends TableDefinitionMap = TableDefinitionMap,
	TKvSchema extends KvSchema = KvSchema,
> = WorkspaceSchema<TTableDefinitionMap, TKvSchema> & {
	/**
	 * Create a workspace client.
	 *
	 * @param options - Optional object with epoch and capabilities.
	 *   - `epoch`: Data Doc version (defaults to 0). Get from Head Doc for multi-user sync.
	 *   - `capabilities`: Capability factories that add functionality like persistence, sync, or SQL queries.
	 *     Each capability receives context and can return exports accessible via `client.capabilities.{name}`.
	 *
	 * @example No options (ephemeral, in-memory, epoch 0)
	 * ```typescript
	 * const client = await workspace.create();
	 * ```
	 *
	 * @example With capabilities only
	 * ```typescript
	 * const client = await workspace.create({
	 *   capabilities: { sqlite, persistence },
	 * });
	 * ```
	 *
	 * @example With epoch from Head Doc
	 * ```typescript
	 * const head = createHeadDoc({ workspaceId: workspace.id });
	 * const epoch = head.getEpoch();
	 * const client = await workspace.create({
	 *   epoch,
	 *   capabilities: { sqlite, persistence },
	 * });
	 * ```
	 *
	 * @example Capabilities with options
	 * ```typescript
	 * const client = await workspace.create({
	 *   epoch: 0,
	 *   capabilities: {
	 *     sqlite: sqlite({ debounceMs: 50 }),
	 *     persistence,
	 *   },
	 * });
	 * ```
	 */
	create<
		TCapabilityFactories extends CapabilityFactoryMap<
			TTableDefinitionMap,
			TKvSchema
		> = {},
	>(options?: {
		epoch?: number;
		capabilities?: TCapabilityFactories;
	}): Promise<
		WorkspaceClient<
			TTableDefinitionMap,
			TKvSchema,
			InferCapabilityExports<TCapabilityFactories>
		>
	>;
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
	TTableDefinitionMap extends TableDefinitionMap = TableDefinitionMap,
	TKvSchema extends KvSchema = KvSchema,
	TCapabilityExports extends Record<string, CapabilityExports> = Record<
		string,
		CapabilityExports
	>,
> = {
	/** Globally unique identifier for sync coordination. */
	id: string;
	/** Human-readable slug for URLs, paths, and CLI commands. */
	slug: string;
	/** Typed table helpers for CRUD operations. */
	tables: Tables<TTableDefinitionMap>;
	/** Key-value store for simple values. */
	kv: Kv<TKvSchema>;
	/** Exports from initialized capabilities. */
	capabilities: TCapabilityExports;
	/** The underlying YJS document. */
	ydoc: Y.Doc;
	/** Clean up resources (close capabilities, destroy YJS doc). */
	destroy(): Promise<void>;
	/** Symbol.asyncDispose for `await using` support. */
	[Symbol.asyncDispose](): Promise<void>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API: Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Define a collaborative workspace with YJS-first architecture.
 *
 * A workspace is a self-contained domain module with tables and capabilities.
 * This function returns a **static definition** with a `.create()` method to
 * instantiate **runtime clients**.
 *
 * @example
 * ```typescript
 * const workspace = defineWorkspace({
 *   id: generateGuid(),
 *   slug: 'blog',
 *   name: 'Blog',
 *   tables: {
 *     posts: {
 *       name: 'Posts',
 *       icon: { type: 'emoji', value: '📝' },
 *       cover: null,
 *       description: 'Blog posts and articles',
 *       fields: {
 *         id: id(),
 *         title: text(),
 *         published: boolean({ default: false }),
 *       },
 *     },
 *   },
 *   kv: {},
 * });
 *
 * // Create a runtime client with capabilities
 * const client = await workspace.create({
 *   capabilities: { sqlite, persistence },
 * });
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
 * @returns A Workspace definition with a `.create()` method
 */
export function defineWorkspace<
	TTableDefinitionMap extends TableDefinitionMap,
	TKvSchema extends KvSchema = Record<string, never>,
>(
	config: WorkspaceSchema<TTableDefinitionMap, TKvSchema>,
): Workspace<TTableDefinitionMap, TKvSchema> {
	if (!config.id || typeof config.id !== 'string') {
		throw new Error('Workspace must have a valid ID');
	}
	if (!config.slug || typeof config.slug !== 'string') {
		throw new Error('Workspace must have a valid slug');
	}

	return {
		...config,

		/**
		 * Create a runtime client for this workspace.
		 *
		 * This is the second phase of the two-phase initialization:
		 * 1. `defineWorkspace()` creates a static definition (schema + metadata)
		 * 2. `.create()` creates a runtime client (Y.Doc + helpers + capabilities)
		 *
		 * ## What happens during creation
		 *
		 * 1. **Y.Doc created** — A new YJS document with GUID `{id}-{epoch}`.
		 *    The epoch creates isolated document namespaces for versioning/sync.
		 *
		 * 2. **Metadata merged** — Workspace name and slug are written to the doc's
		 *    meta map (idempotent; only updates if values differ).
		 *
		 * 3. **Schema merged** — Code-defined table/kv schemas are merged into the
		 *    doc's schema map. New fields are added, changed fields are updated,
		 *    existing identical fields are untouched. Safe to call repeatedly.
		 *
		 * 4. **Helpers created** — Typed `tables` and `kv` helpers are bound to
		 *    the Y.Doc for CRUD operations.
		 *
		 * 5. **Capabilities initialized** — Factory functions run in parallel,
		 *    each receiving context (ydoc, tables, kv). Their exports become
		 *    available on `client.capabilities`.
		 *
		 * ## Important behaviors
		 *
		 * - **No automatic persistence**: Data lives only in memory unless you
		 *   provide a persistence capability.
		 *
		 * - **No automatic sync**: The client is isolated unless you provide
		 *   a sync capability (e.g., WebSocket provider).
		 *
		 * - **Multiple clients are independent**: Calling `.create()` twice
		 *   returns two separate Y.Docs and clients. They don't share state
		 *   unless connected via sync capabilities.
		 *
		 * - **Capabilities run in parallel**: Don't rely on execution order
		 *   between capabilities. Each should be independent.
		 *
		 * @param options - Optional configuration
		 * @param options.epoch - Data Doc version (defaults to 0). The Y.Doc GUID
		 *   is `{workspaceId}-{epoch}`. Change this intentionally to create a
		 *   separate document namespace (e.g., for migrations or sync isolation).
		 *   Get from Head Doc for multi-user sync scenarios.
		 * @param options.capabilities - Factory functions that add features like
		 *   persistence, sync, or SQL queries. Each factory receives context and
		 *   can return exports accessible via `client.capabilities.{name}`.
		 *
		 * @example No options (ephemeral, in-memory, epoch 0)
		 * ```typescript
		 * const client = await workspace.create();
		 * ```
		 *
		 * @example With capabilities
		 * ```typescript
		 * const client = await workspace.create({
		 *   capabilities: { sqlite, persistence },
		 * });
		 * // client.capabilities.sqlite is now available
		 * ```
		 *
		 * @example With epoch from Head Doc (multi-user sync)
		 * ```typescript
		 * const head = createHeadDoc({ workspaceId: workspace.id });
		 * const epoch = head.getEpoch();
		 * const client = await workspace.create({
		 *   epoch,
		 *   capabilities: { sqlite, persistence, sync },
		 * });
		 * ```
		 *
		 * @example Automatic cleanup with `await using`
		 * ```typescript
		 * {
		 *   await using client = await workspace.create();
		 *   client.tables.posts.upsert({ id: '1', title: 'Hello' });
		 * } // Automatically cleaned up here
		 * ```
		 */
		async create<
			TCapabilityFactories extends CapabilityFactoryMap<
				TTableDefinitionMap,
				TKvSchema
			> = {},
		>({
			epoch = 0,
			capabilities: capabilityFactories = {} as TCapabilityFactories,
		}: {
			epoch?: number;
			capabilities?: TCapabilityFactories;
		} = {}): Promise<
			WorkspaceClient<
				TTableDefinitionMap,
				TKvSchema,
				InferCapabilityExports<TCapabilityFactories>
			>
		> {
			// Create Data Y.Doc with deterministic GUID
			const docId = `${config.id}-${epoch}` as const;
			const ydoc = new Y.Doc({ guid: docId });

			// Merge workspace metadata (update if different from config)
			const metaMap = ydoc.getMap<string>('meta');
			if (metaMap.get('name') !== config.name) {
				metaMap.set('name', config.name);
			}
			if (metaMap.get('slug') !== config.slug) {
				metaMap.set('slug', config.slug);
			}

			// Merge full table definitions (with metadata) into Y.Doc schema
			mergeSchemaIntoYDoc(ydoc, config.tables, config.kv);

			// Create table and kv helpers bound to the Y.Doc
			const tables = createTables(ydoc, config.tables);
			const kv = createKv(ydoc, config.kv);

			// Run capability factories in parallel
			const capabilityExports = Object.fromEntries(
				await Promise.all(
					Object.entries(capabilityFactories).map(
						async ([capabilityId, capabilityFactory]) => {
							const result = await capabilityFactory({
								id: config.id,
								slug: config.slug,
								capabilityId,
								ydoc,
								tables,
								kv,
							});
							return [capabilityId, result ?? {}];
						},
					),
				),
			) as InferCapabilityExports<TCapabilityFactories>;

			const destroy = async () => {
				await Promise.all(
					Object.values(capabilityExports).map((capability) =>
						(capability as CapabilityExports).destroy?.(),
					),
				);
				ydoc.destroy();
			};

			return {
				id: config.id,
				slug: config.slug,
				ydoc,
				tables,
				kv,
				capabilities: capabilityExports,
				destroy,
				[Symbol.asyncDispose]: destroy,
			};
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: Schema Merge Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Type for the inner Y.Map that stores table schema with metadata.
 */
type TableSchemaMap = Y.Map<
	string | IconDefinition | CoverDefinition | null | Y.Map<FieldSchema>
>;

/**
 * Merge code-defined schema into Y.Doc schema.
 *
 * Uses pure merge semantics:
 * - If table/field doesn't exist → add it
 * - If table/field exists with different value → update it
 * - If table/field exists with same value → no-op (CRDT handles)
 *
 * Idempotent and safe for concurrent calls.
 */
function mergeSchemaIntoYDoc(
	ydoc: Y.Doc,
	tables: TableDefinitionMap,
	kv: KvSchema,
) {
	const schemaMap = ydoc.getMap<Y.Map<unknown>>('schema');

	// Initialize schema submaps if not present
	if (!schemaMap.has('tables')) {
		schemaMap.set('tables', new Y.Map());
	}
	if (!schemaMap.has('kv')) {
		schemaMap.set('kv', new Y.Map());
	}

	const tablesSchemaMap = schemaMap.get('tables') as Y.Map<TableSchemaMap>;
	const kvSchemaMap = schemaMap.get('kv') as Y.Map<FieldSchema>;

	ydoc.transact(() => {
		for (const [tableName, tableDefinition] of Object.entries(tables)) {
			// Get or create the table schema map
			let tableMap = tablesSchemaMap.get(tableName);
			if (!tableMap) {
				tableMap = new Y.Map() as TableSchemaMap;
				tableMap.set('fields', new Y.Map<FieldSchema>());
				tablesSchemaMap.set(tableName, tableMap);
			}

			// Merge table metadata
			const currentName = tableMap.get('name') as string | undefined;
			if (currentName !== tableDefinition.name) {
				tableMap.set('name', tableDefinition.name);
			}

			const currentIcon = tableMap.get('icon') as
				| IconDefinition
				| null
				| undefined;
			if (!Value.Equal(currentIcon, tableDefinition.icon)) {
				tableMap.set('icon', tableDefinition.icon);
			}

			const currentCover = tableMap.get('cover') as
				| CoverDefinition
				| null
				| undefined;
			if (!Value.Equal(currentCover, tableDefinition.cover)) {
				tableMap.set('cover', tableDefinition.cover);
			}

			const currentDescription = tableMap.get('description') as
				| string
				| undefined;
			if (currentDescription !== tableDefinition.description) {
				tableMap.set('description', tableDefinition.description);
			}

			// Merge fields
			let fieldsMap = tableMap.get('fields') as Y.Map<FieldSchema> | undefined;
			if (!fieldsMap) {
				fieldsMap = new Y.Map();
				tableMap.set('fields', fieldsMap);
			}

			for (const [fieldName, fieldSchema] of Object.entries(
				tableDefinition.fields,
			)) {
				const existing = fieldsMap.get(fieldName);

				if (!existing || !Value.Equal(existing, fieldSchema)) {
					fieldsMap.set(fieldName, fieldSchema);
				}
			}
		}

		for (const [keyName, fieldSchema] of Object.entries(kv)) {
			const existing = kvSchemaMap.get(keyName);

			if (!existing || !Value.Equal(existing, fieldSchema)) {
				kvSchemaMap.set(keyName, fieldSchema);
			}
		}
	});
}
