/**
 * Workspace definition and creation for YJS-first collaborative workspaces.
 *
 * This module provides the core workspace API:
 * - {@link defineWorkspace} - Factory to create workspace definitions
 * - {@link Workspace} - The workspace object with `.create()` method
 * - {@link WorkspaceClient} - The runtime client for interacting with data
 *
 * ## Architecture Overview
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Two-Phase Initialization                                                   │
 * │                                                                             │
 * │   defineWorkspace(config)              workspace.create(options)            │
 * │   ─────────────────────────            ────────────────────────             │
 * │                                                                             │
 * │   ┌─────────────────────┐              ┌─────────────────────┐              │
 * │   │ WorkspaceDefinition │    epoch     │  WorkspaceClient    │              │
 * │   │                     │ ──────────▶  │                     │              │
 * │   │ • id (GUID)         │ capabilities │  • Y.Doc instance   │              │
 * │   │ • slug              │              │  • tables helpers   │              │
 * │   │ • name              │              │  • kv helpers       │              │
 * │   │ • tables schema     │              │  • capabilities     │              │
 * │   │ • kv schema         │              │  • whenSynced       │              │
 * │   └─────────────────────┘              └─────────────────────┘              │
 * │                                                                             │
 * │   Static (no I/O)                      Dynamic (creates Y.Doc)              │
 * └─────────────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Sync Construction Pattern
 *
 * This module implements the "sync construction, async property" pattern:
 *
 * - `workspace.create()` returns **immediately** with a client object
 * - Async initialization (persistence, sync) tracked via `client.whenSynced`
 * - UI frameworks use `whenSynced` as a render gate
 *
 * ```typescript
 * // Sync construction - returns immediately
 * const client = workspace.create({ capabilities: { sqlite } });
 *
 * // Sync access works immediately (operates on in-memory Y.Doc)
 * client.tables.posts.upsert({ id: '1', title: 'Hello' });
 *
 * // Await when you need initialization complete
 * await client.whenSynced;
 * ```
 *
 * For Node.js scripts that prefer async semantics, see {@link ./node.ts}.
 *
 * ## Related Modules
 *
 * - {@link ../lifecycle.ts} - Lifecycle protocol (`whenSynced`, `destroy`)
 * - {@link ../capability.ts} - Capability factory types
 * - {@link ../docs/head-doc.ts} - Head Doc for epoch management
 * - {@link ../docs/registry-doc.ts} - Registry Doc for workspace discovery
 * - {@link ./node.ts} - Node.js async wrapper
 *
 * @module
 */

import { Value } from 'typebox/value';
import * as Y from 'yjs';
import type {
	CapabilityFactoryMap,
	InferCapabilityExports,
} from '../capability';
import { createKv, type Kv } from '../kv/core';
import { defineExports, type Lifecycle, type MaybePromise } from '../lifecycle';
import type { KvDefinitionMap, TableDefinitionMap } from '../schema';
import type {
	CoverDefinition,
	FieldSchema,
	IconDefinition,
	KvDefinition,
} from '../schema/fields/types';
import { createTables, type Tables } from '../tables/create-tables';

// ─────────────────────────────────────────────────────────────────────────────
// Public API: Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A workspace definition describes the pure data shape of a workspace.
 *
 * This type is fully JSON-serializable and contains no methods or runtime behavior.
 * It represents the configuration passed to `defineWorkspace()`.
 *
 * Use `defineWorkspace()` to create a `Workspace` object with a `.create()` method.
 */
export type WorkspaceDefinition<
	TTableDefinitionMap extends TableDefinitionMap = TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap = KvDefinitionMap,
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
	/** Key-value store definitions with metadata. */
	kv: TKvDefinitionMap;
};

/**
 * A workspace object returned by `defineWorkspace()`.
 *
 * Contains the schema (tables, kv, id, slug) and a `.create()` method
 * to instantiate a runtime client. The `.create()` method uses **sync construction**:
 * it returns immediately with a client, and async initialization is tracked via
 * `client.whenSynced`.
 *
 * @example No capabilities (ephemeral, in-memory)
 * ```typescript
 * const client = workspace.create();
 * // Client is usable immediately (in-memory Y.Doc)
 * client.tables.posts.upsert({ id: '1', title: 'Hello' });
 * ```
 *
 * @example With capabilities and render gate
 * ```typescript
 * const client = workspace.create({
 *   capabilities: { sqlite, persistence },
 * });
 *
 * // In Svelte - wait for initialization before rendering children
 * {#await client.whenSynced}
 *   <Loading />
 * {:then}
 *   <App />
 * {/await}
 * ```
 *
 * @example Await when needed
 * ```typescript
 * const client = workspace.create({
 *   capabilities: { sqlite, persistence },
 * });
 *
 * // If you need to ensure persistence loaded before proceeding:
 * await client.whenSynced;
 * const posts = client.tables.posts.getAllValid();
 * ```
 *
 * @see {@link ./node.ts} - For async `create()` that awaits internally (Node.js scripts)
 */
export type Workspace<
	TTableDefinitionMap extends TableDefinitionMap = TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap = KvDefinitionMap,
> = WorkspaceDefinition<TTableDefinitionMap, TKvDefinitionMap> & {
	/**
	 * Create a workspace client (sync construction).
	 *
	 * Returns immediately with a client object. Capabilities are initialized
	 * in the background; use `client.whenSynced` to await full initialization.
	 *
	 * @param options - Optional object with epoch and capabilities.
	 *   - `epoch`: Workspace Doc version (defaults to 0). Get from Head Doc for multi-user sync.
	 *   - `capabilities`: Capability factories that add functionality like persistence, sync, or SQL queries.
	 *     Each capability receives context and can return exports accessible via `client.capabilities.{name}`.
	 *
	 * @example No options (ephemeral, in-memory, epoch 0)
	 * ```typescript
	 * const client = workspace.create();
	 * await client.whenSynced; // Optional: wait for initialization
	 * ```
	 *
	 * @example With capabilities and render gate
	 * ```typescript
	 * const client = workspace.create({
	 *   capabilities: { sqlite, persistence },
	 * });
	 *
	 * // In UI (e.g., Svelte)
	 * {#await client.whenSynced}
	 *   <Loading />
	 * {:then}
	 *   <App />
	 * {/await}
	 * ```
	 *
	 * @example With epoch from Head Doc
	 * ```typescript
	 * const head = createHeadDoc({ workspaceId: workspace.id });
	 * const epoch = head.getEpoch();
	 * const client = workspace.create({
	 *   epoch,
	 *   capabilities: { sqlite, persistence },
	 * });
	 * await client.whenSynced;
	 * ```
	 */
	create<
		TCapabilityFactories extends CapabilityFactoryMap<
			TTableDefinitionMap,
			TKvDefinitionMap
		> = {},
	>(options?: {
		epoch?: number;
		capabilities?: TCapabilityFactories;
	}): WorkspaceClient<
		TTableDefinitionMap,
		TKvDefinitionMap,
		InferCapabilityExports<TCapabilityFactories>
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
	TKvDefinitionMap extends KvDefinitionMap = KvDefinitionMap,
	TCapabilityExports extends Record<string, Lifecycle> = Record<
		string,
		Lifecycle
	>,
> = {
	/** Globally unique identifier for sync coordination. */
	id: string;
	/** Human-readable slug for URLs, paths, and CLI commands. */
	slug: string;
	/** Typed table helpers for CRUD operations. */
	tables: Tables<TTableDefinitionMap>;
	/** Key-value store for simple values. */
	kv: Kv<TKvDefinitionMap>;
	/** Exports from initialized capabilities. */
	capabilities: TCapabilityExports;
	/** The underlying YJS document. */
	ydoc: Y.Doc;
	/**
	 * Resolves when all capabilities are initialized and ready.
	 *
	 * Use this as a render gate in UI frameworks:
	 * ```svelte
	 * {#await client.whenSynced}
	 *   <Loading />
	 * {:then}
	 *   <App />
	 * {/await}
	 * ```
	 */
	whenSynced: Promise<void>;
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
	TKvDefinitionMap extends KvDefinitionMap = Record<string, never>,
>(
	config: WorkspaceDefinition<TTableDefinitionMap, TKvDefinitionMap>,
): Workspace<TTableDefinitionMap, TKvDefinitionMap> {
	if (!config.id || typeof config.id !== 'string') {
		throw new Error('Workspace must have a valid ID');
	}
	if (!config.slug || typeof config.slug !== 'string') {
		throw new Error('Workspace must have a valid slug');
	}

	return {
		...config,

		/**
		 * Create a runtime client for this workspace (sync construction).
		 *
		 * Returns immediately with a usable client. Capabilities are initialized
		 * in the background; use `client.whenSynced` to await full initialization.
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
		 * 2. **Definition merged** — Workspace definition (name, slug, tables, kv) is
		 *    merged into the doc's definition map. New values are added, changed
		 *    values are updated, identical values are untouched. Safe to call repeatedly.
		 *
		 * 3. **Helpers created** — Typed `tables` and `kv` helpers are bound to
		 *    the Y.Doc for CRUD operations.
		 *
		 * 4. **Capabilities started** — Factory functions run in parallel (without blocking).
		 *    Their exports become available on `client.capabilities` after `whenSynced`.
		 *
		 * ## Important behaviors
		 *
		 * - **Sync construction**: The client is returned immediately. Use
		 *   `client.whenSynced` as a render gate in UI frameworks.
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
		 * @param options.epoch - Workspace Doc version (defaults to 0). The Y.Doc GUID
		 *   is `{workspaceId}-{epoch}`. Change this intentionally to create a
		 *   separate document namespace (e.g., for migrations or sync isolation).
		 *   Get from Head Doc for multi-user sync scenarios.
		 * @param options.capabilities - Factory functions that add features like
		 *   persistence, sync, or SQL queries. Each factory receives context and
		 *   can return exports accessible via `client.capabilities.{name}`.
		 *
		 * @example Sync construction with render gate
		 * ```typescript
		 * const client = workspace.create({
		 *   capabilities: { sqlite, persistence },
		 * });
		 *
		 * // In Svelte
		 * {#await client.whenSynced}
		 *   <Loading />
		 * {:then}
		 *   <App />
		 * {/await}
		 * ```
		 *
		 * @example With epoch from Head Doc (multi-user sync)
		 * ```typescript
		 * const head = createHeadDoc({ workspaceId: workspace.id });
		 * const epoch = head.getEpoch();
		 * const client = workspace.create({
		 *   epoch,
		 *   capabilities: { sqlite, persistence, sync },
		 * });
		 * await client.whenSynced;
		 * ```
		 *
		 * @example Automatic cleanup with `await using`
		 * ```typescript
		 * {
		 *   await using client = workspace.create();
		 *   await client.whenSynced;
		 *   client.tables.posts.upsert({ id: '1', title: 'Hello' });
		 * } // Automatically cleaned up here
		 * ```
		 */
		create<
			TCapabilityFactories extends CapabilityFactoryMap<
				TTableDefinitionMap,
				TKvDefinitionMap
			> = {},
		>({
			epoch = 0,
			capabilities: capabilityFactories = {} as TCapabilityFactories,
		}: {
			epoch?: number;
			capabilities?: TCapabilityFactories;
		} = {}): WorkspaceClient<
			TTableDefinitionMap,
			TKvDefinitionMap,
			InferCapabilityExports<TCapabilityFactories>
		> {
			// Create Workspace Y.Doc with deterministic GUID
			// gc: false is required for revision history snapshots to work
			const docId = `${config.id}-${epoch}` as const;
			const ydoc = new Y.Doc({ guid: docId, gc: false });

			// Merge workspace definition (name, slug, tables, kv) into Y.Doc
			mergeDefinitionIntoYDoc(ydoc, config);

			// Create table and kv helpers bound to the Y.Doc
			const tables = createTables(ydoc, config.tables);
			const kv = createKv(ydoc, config.kv);

			// Initialize capability exports object and tracking arrays
			const capabilities = {} as InferCapabilityExports<TCapabilityFactories>;
			const initPromises: Promise<void>[] = [];

			// Pre-seed capabilities with placeholder lifecycle so runtime matches type shape.
			// Also create destroy functions that reference current exports (handles late binding).
			const destroyFns: Array<() => MaybePromise<void>> = [];
			for (const capabilityId of Object.keys(capabilityFactories)) {
				(capabilities as Record<string, unknown>)[capabilityId] =
					defineExports();
				destroyFns.push(() =>
					// Non-null assertion safe: we just set this key above
					(capabilities as Record<string, Lifecycle>)[capabilityId]!.destroy(),
				);
			}

			// Start capability factories (without awaiting)
			for (const [capabilityId, capabilityFactory] of Object.entries(
				capabilityFactories,
			)) {
				initPromises.push(
					Promise.resolve(
						capabilityFactory({
							id: config.id,
							slug: config.slug,
							capabilityId,
							ydoc,
							tables,
							kv,
						}),
					).then((result) => {
						// Always normalize at boundary - handles void, plain objects, and full lifecycle
						const exports = defineExports(
							result as Record<string, unknown> | undefined,
						);
						(capabilities as Record<string, unknown>)[capabilityId] = exports;
					}),
				);
			}

			// Use allSettled so init failures don't block destroy
			const whenCapabilitiesInitializedSettled = Promise.allSettled(
				initPromises,
			).then(() => {});

			// whenSynced is fail-fast (any rejection rejects the whole thing)
			// This is intentional - UI render gates should show error state
			const whenSynced = whenCapabilitiesInitializedSettled
				.then(() =>
					Promise.all(
						Object.values(capabilities).map((c) => (c as Lifecycle).whenSynced),
					),
				)
				.then(() => {});

			const destroy = async () => {
				// Wait for init to settle (not complete) - never block on init failures
				await whenCapabilitiesInitializedSettled;

				try {
					// Use allSettled so one destroy failure doesn't block others
					await Promise.allSettled(destroyFns.map((fn) => fn()));
				} finally {
					// Always release doc resources
					ydoc.destroy();
				}
			};

			return {
				id: config.id,
				slug: config.slug,
				ydoc,
				tables,
				kv,
				capabilities,
				whenSynced,
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
 * Type for the inner Y.Map that stores a table definition with metadata.
 */
type TableDefinitionYMap = Y.Map<
	string | IconDefinition | CoverDefinition | null | Y.Map<FieldSchema>
>;

/**
 * Merge code-defined workspace definition into Y.Doc.
 *
 * ## Y.Doc Structure
 *
 * The `'definition'` map is a 1:1 mapping of {@link WorkspaceDefinition},
 * except `id` which lives in the doc GUID (`{id}-{epoch}`).
 *
 * ```
 * Y.Doc (guid: "{id}-{epoch}")
 * └── 'definition' (Y.Map)
 *     ├── 'name'    → string           // WorkspaceDefinition.name
 *     ├── 'slug'    → string           // WorkspaceDefinition.slug
 *     ├── 'tables'  → Y.Map<...>       // WorkspaceDefinition.tables
 *     └── 'kv'      → Y.Map<...>       // WorkspaceDefinition.kv
 * ```
 *
 * To reconstruct a full WorkspaceDefinition:
 * - `id`: Extract from `ydoc.guid.split('-')[0]`
 * - Everything else: Read from `ydoc.getMap('definition')`
 *
 * ## Merge Semantics
 *
 * Uses pure merge (idempotent, safe for concurrent calls):
 * - If value doesn't exist → add it
 * - If value exists with different value → update it
 * - If value exists with same value → no-op (CRDT handles)
 */
function mergeDefinitionIntoYDoc(
	ydoc: Y.Doc,
	config: {
		name: string;
		slug: string;
		tables: TableDefinitionMap;
		kv: KvDefinitionMap;
	},
) {
	const definitionMap = ydoc.getMap<Y.Map<unknown> | string>('definition');

	// Merge workspace-level metadata
	if (definitionMap.get('name') !== config.name) {
		definitionMap.set('name', config.name);
	}
	if (definitionMap.get('slug') !== config.slug) {
		definitionMap.set('slug', config.slug);
	}

	// Initialize definition submaps if not present
	if (!definitionMap.has('tables')) {
		definitionMap.set('tables', new Y.Map());
	}
	if (!definitionMap.has('kv')) {
		definitionMap.set('kv', new Y.Map());
	}

	const tablesDefMap = definitionMap.get(
		'tables',
	) as Y.Map<TableDefinitionYMap>;
	const kvDefMap = definitionMap.get('kv') as Y.Map<KvDefinition>;

	ydoc.transact(() => {
		for (const [tableName, tableDefinition] of Object.entries(config.tables)) {
			// Get or create the table definition map
			let tableMap = tablesDefMap.get(tableName);
			if (!tableMap) {
				tableMap = new Y.Map() as TableDefinitionYMap;
				tableMap.set('fields', new Y.Map<FieldSchema>());
				tablesDefMap.set(tableName, tableMap);
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

			for (const [fieldName, fieldDefinition] of Object.entries(
				tableDefinition.fields,
			)) {
				const existing = fieldsMap.get(fieldName);

				if (!existing || !Value.Equal(existing, fieldDefinition)) {
					fieldsMap.set(fieldName, fieldDefinition);
				}
			}
		}

		for (const [keyName, kvDefinition] of Object.entries(config.kv)) {
			const existing = kvDefMap.get(keyName);

			if (!existing || !Value.Equal(existing, kvDefinition)) {
				kvDefMap.set(keyName, kvDefinition);
			}
		}
	});
}
