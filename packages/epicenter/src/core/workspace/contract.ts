import * as Y from 'yjs';
import type {
	CapabilityExports,
	CapabilityMap,
	InferCapabilityExports,
} from '../capability';
import { createKv, type Kv } from '../kv/core';
import type { KvSchema, TablesSchema, TablesWithMetadata } from '../schema';
import type {
	CoverDefinition,
	FieldSchema,
	IconDefinition,
	TableDefinition,
} from '../schema/fields/types';
import { createTables, type Tables } from '../tables/create-tables';

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
	TTablesSchema extends TablesSchema = TablesSchema,
	TKvSchema extends KvSchema = KvSchema,
> = WorkspaceSchema<TTablesSchema, TKvSchema> & {
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
		TCapabilities extends CapabilityMap<TTablesSchema, TKvSchema> = {},
	>(options?: {
		epoch?: number;
		capabilities?: TCapabilities;
	}): Promise<WorkspaceClient<TTablesSchema, TKvSchema, TCapabilities>>;
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
	ydoc: Y.Doc;
	tables: Tables<TTablesSchema>;
	kv: Kv<TKvSchema>;
	capabilityExports: InferCapabilityExports<TCapabilities>;
	cleanup: () => Promise<void>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Schema Merge Utilities (inlined from data-doc.ts)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deep equality check for field schemas.
 * Compares all properties including metadata (name, description, icon).
 */
function deepEqualFieldSchema(a: FieldSchema, b: FieldSchema): boolean {
	if (a.type !== b.type) return false;
	if (a.name !== b.name) return false;
	if (a.description !== b.description) return false;

	if (a.icon !== b.icon) {
		if (!a.icon || !b.icon) return false;
		if (a.icon.type !== b.icon.type) return false;
		if (a.icon.type === 'emoji' && b.icon.type === 'emoji') {
			if (a.icon.value !== b.icon.value) return false;
		} else if (a.icon.type === 'external' && b.icon.type === 'external') {
			if (a.icon.url !== b.icon.url) return false;
		}
	}

	return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Check if a table value is TablesWithMetadata format (has 'fields' property).
 */
function isTableDefinition(
	value: Record<string, FieldSchema> | TableDefinition,
): value is TableDefinition {
	return 'fields' in value && typeof value.fields === 'object';
}

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
	tables: TablesSchema | TablesWithMetadata,
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
		for (const [tableName, tableValue] of Object.entries(tables)) {
			// Determine if this is TablesWithMetadata or TablesSchema format
			const tableDefinition: TableDefinition = isTableDefinition(tableValue)
				? tableValue
				: {
						name: tableName,
						icon: null,
						cover: null,
						description: '',
						fields: tableValue,
					};

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
			if (
				JSON.stringify(currentIcon) !== JSON.stringify(tableDefinition.icon)
			) {
				tableMap.set('icon', tableDefinition.icon);
			}

			const currentCover = tableMap.get('cover') as
				| CoverDefinition
				| null
				| undefined;
			if (
				JSON.stringify(currentCover) !== JSON.stringify(tableDefinition.cover)
			) {
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

				if (!existing || !deepEqualFieldSchema(existing, fieldSchema)) {
					fieldsMap.set(fieldName, fieldSchema);
				}
			}
		}

		for (const [keyName, fieldSchema] of Object.entries(kv)) {
			const existing = kvSchemaMap.get(keyName);

			if (!existing || !deepEqualFieldSchema(existing, fieldSchema)) {
				kvSchemaMap.set(keyName, fieldSchema);
			}
		}
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// Workspace Initialization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initialize a workspace: create Data Y.Doc, seed schema, tables, kv, and run capability factories.
 *
 * This is an internal function called by `.create()`. It:
 * 1. Creates a Data Y.Doc with `{id}-{epoch}` as the doc GUID
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
	epoch: number,
	capabilities: TCapabilities,
): Promise<InitializedWorkspace<TTablesSchema, TKvSchema, TCapabilities>> {
	// Create Data Y.Doc with deterministic GUID
	const docId = `${config.id}-${epoch}` as const;
	const ydoc = new Y.Doc({ guid: docId });

	// Get metadata map for name/slug storage
	const metaMap = ydoc.getMap<string>('meta');

	// Set workspace metadata (only if not already set by sync)
	if (!metaMap.get('name')) {
		metaMap.set('name', config.name);
	}
	if (!metaMap.get('slug')) {
		metaMap.set('slug', config.slug);
	}

	// Merge code schema into Y.Doc schema (idempotent, CRDT handles conflicts)
	mergeSchemaIntoYDoc(ydoc, config.tables, config.kv);

	// Create table and kv helpers using the Y.Doc
	const tables = createTables(ydoc, config.tables);
	const kv = createKv(ydoc, config.kv);

	// Run capability factories in parallel
	const capabilityExports = Object.fromEntries(
		await Promise.all(
			Object.entries(capabilities).map(
				async ([capabilityId, capabilityFn]) => {
					const result = await capabilityFn({
						id: config.slug,
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
		>({
			epoch = 0,
			capabilities = {} as TCapabilities,
		}: {
			epoch?: number;
			capabilities?: TCapabilities;
		} = {}): Promise<WorkspaceClient<TTablesSchema, TKvSchema, TCapabilities>> {
			const { ydoc, tables, kv, capabilityExports, cleanup } =
				await initializeWorkspace(config, epoch, capabilities);

			return {
				id: config.id,
				slug: config.slug,
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
