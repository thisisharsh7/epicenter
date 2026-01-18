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
 * │   │ • id                │ capabilities │  • Y.Doc instance   │              │
 * │   │ • name              │              │  • tables helpers   │              │
 * │   │                     │              │  • kv helpers       │              │
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

import humanizeString from 'humanize-string';
import * as Y from 'yjs';
import type {
	CapabilityFactoryMap,
	InferCapabilityExports,
} from '../capability';
import { createKv, type Kv } from '../kv/core';
import { defineExports, type Lifecycle, type MaybePromise } from '../lifecycle';
import type { KvDefinitionMap, TableDefinitionMap } from '../schema';
import type {
	FieldSchemaMap,
	KvDefinition,
	KvFieldSchema,
	TableDefinition,
} from '../schema/fields/types';
import { createTables, type Tables } from '../tables/create-tables';
import { normalizeKv, normalizeTable } from './normalize';

// ─────────────────────────────────────────────────────────────────────────────
// Public API: Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A workspace definition describes the initial configuration for a workspace.
 *
 * This type is fully JSON-serializable and contains no methods or runtime behavior.
 * It represents the configuration passed to `defineWorkspace()`.
 *
 * ## Initial Values vs Live State
 *
 * When you call `workspace.create()`, these values are **merged** into the Y.Doc's
 * CRDT state. After creation, `name`, `tables`, and `kv` become **live**
 * collaborative state that can change via CRDT sync.
 *
 * - `id` — Immutable identity, baked into Y.Doc GUID. Never changes.
 * - `name` — Initial value; becomes live CRDT state after creation.
 * - `tables`, `kv` — Initial definitions; merged into Y.Doc definition map.
 *
 * On the returned {@link WorkspaceClient}:
 * - `client.id` — Static (same as definition)
 * - `client.name` — Live getter (read from CRDT on each access)
 *
 * @example
 * ```typescript
 * // Define with initial values
 * const workspace = defineWorkspace({
 *   id: 'epicenter.blog',   // human-readable ID
 *   name: 'My Blog',        // initial name
 *   tables: { posts: {...} },
 *   kv: {},
 * });
 *
 * // After creation, name is live CRDT state
 * const client = workspace.create();
 * console.log(client.name);  // "My Blog" (from CRDT)
 *
 * // If a peer changes the name via CRDT sync...
 * console.log(client.name);  // "Our Blog" (reflects live change)
 * ```
 */
export type WorkspaceDefinition<
	TTableDefinitionMap extends TableDefinitionMap = TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap = KvDefinitionMap,
> = {
	/**
	 * Human-readable workspace identifier used for URLs, paths, and sync.
	 * Baked into the Y.Doc GUID — never changes after creation.
	 *
	 * Format: lowercase alphanumeric with dots and hyphens (e.g., "my-notes", "epicenter.whispering").
	 * Epicenter apps use the convention `epicenter.{appname}`.
	 */
	id: string;
	/**
	 * Display name shown in UI.
	 */
	name: string;
	/**
	 * Initial table definitions with metadata (name, icon, cover, description, fields).
	 * Merged into Y.Doc definition map on creation.
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
	/**
	 * Initial key-value store definitions with metadata.
	 * Merged into Y.Doc definition map on creation.
	 */
	kv: TKvDefinitionMap;
};

/**
 * A workspace object returned by `defineWorkspace()`.
 *
 * Contains the schema (tables, kv, id) and a `.create()` method
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
 * - Access live metadata via `client.name` (CRDT-backed getter)
 * - Access tables via `client.tables.tableName.get/upsert/etc.`
 * - Access kv store via `client.kv.key.get/set/etc.`
 * - Access capability exports via `client.capabilities.capabilityId`
 * - Access the underlying YJS document via `client.ydoc`
 *
 * ## Identity vs Live State
 *
 * - `client.id` — **immutable** identity (from Y.Doc GUID, never changes)
 * - `client.name` — **live** CRDT state (reflects real-time changes)
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
	/**
	 * Immutable workspace identity for sync coordination.
	 * Derived from Y.Doc GUID — never changes after creation.
	 */
	readonly id: string;

	/**
	 * Live workspace name from CRDT state.
	 * Reads from Y.Map on each access — reflects real-time collaborative changes.
	 *
	 * @example
	 * ```typescript
	 * console.log(client.name);  // "My Blog"
	 * // After a peer renames the workspace...
	 * console.log(client.name);  // "Our Blog" (updated via CRDT sync)
	 * ```
	 */
	readonly name: string;

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
 * Flexible input type for `defineWorkspace()`.
 *
 * This is what you **write**. It accepts either:
 * - **Minimal**: just field schemas for tables/kv (metadata auto-generated)
 * - **Full**: complete TableDefinition/KvDefinition with all metadata
 *
 * After normalization, this becomes a `WorkspaceDefinition` (the canonical form).
 *
 * @example Minimal input (auto-generates name, icons, descriptions)
 * ```typescript
 * defineWorkspace({
 *   id: 'epicenter.blog',
 *   tables: {
 *     posts: { id: id(), title: text() },  // Just fields
 *   },
 *   kv: {},
 * });
 * // Result: name='Epicenter blog', tables.posts.name='Posts', etc.
 * ```
 *
 * @example Full input (explicit metadata)
 * ```typescript
 * defineWorkspace({
 *   id: 'epicenter.blog',
 *   name: 'My Blog',
 *   tables: {
 *     posts: {
 *       name: 'Blog Posts',
 *       icon: { type: 'emoji', value: '📝' },
 *       cover: null,
 *       description: 'All blog posts',
 *       fields: { id: id(), title: text() },
 *     },
 *   },
 *   kv: {},
 * });
 * ```
 */
export type WorkspaceInput<
	TTables extends Record<string, FieldSchemaMap | TableDefinition> = Record<
		string,
		FieldSchemaMap | TableDefinition
	>,
	TKv extends Record<string, KvFieldSchema | KvDefinition> = Record<
		string,
		KvFieldSchema | KvDefinition
	>,
> = {
	/** Workspace identifier (e.g., "epicenter.blog") */
	id: string;
	/** Display name. If omitted, derived from id via humanization. */
	name?: string;
	/** Tables: either full TableDefinitions or just field schemas */
	tables: TTables;
	/** KV entries: either full KvDefinitions or just field schemas */
	kv: TKv;
};

/**
 * Extract the fields type from a table input (handles both full and minimal).
 */
type ExtractTableFields<T> =
	T extends TableDefinition<infer TFields>
		? TFields
		: T extends FieldSchemaMap
			? T
			: never;

/**
 * Extract the field type from a KV input (handles both full and minimal).
 */
type ExtractKvField<T> =
	T extends KvDefinition<infer TField>
		? TField
		: T extends KvFieldSchema
			? T
			: never;

/**
 * Type-level normalization for tables.
 *
 * Converts a map of table inputs (which may be minimal or full) into a map
 * of `TableDefinition`. This ensures the output type is always the canonical form.
 *
 * @example
 * ```typescript
 * // Input: { posts: { id: id(), title: text() } }
 * // NormalizedTables<...> = { posts: TableDefinition<{ id: ..., title: ... }> }
 * ```
 */
export type NormalizedTables<
	TTables extends Record<string, FieldSchemaMap | TableDefinition>,
> = {
	[K in keyof TTables]: TableDefinition<ExtractTableFields<TTables[K]>>;
};

/**
 * Type-level normalization for KV entries.
 *
 * Converts a map of KV inputs (which may be minimal or full) into a map
 * of `KvDefinition`. This ensures the output type is always the canonical form.
 *
 * @example
 * ```typescript
 * // Input: { theme: select({ options: ['light', 'dark'] }) }
 * // NormalizedKv<...> = { theme: KvDefinition<SelectFieldSchema<...>> }
 * ```
 */
export type NormalizedKv<
	TKv extends Record<string, KvFieldSchema | KvDefinition>,
> = {
	[K in keyof TKv]: KvDefinition<ExtractKvField<TKv[K]>>;
};

/**
 * Normalize a workspace input to a full WorkspaceDefinition.
 *
 * Handles mixed input where:
 * - Tables can be full definitions or just field schemas
 * - KV entries can be full definitions or just field schemas
 * - Name is derived from id if not provided
 */
function normalizeWorkspaceInput<
	TTables extends Record<string, FieldSchemaMap | TableDefinition>,
	TKv extends Record<string, KvFieldSchema | KvDefinition>,
>(
	input: WorkspaceInput<TTables, TKv>,
): WorkspaceDefinition<NormalizedTables<TTables>, NormalizedKv<TKv>> {
	// Normalize all tables
	// TableDefinition has 'fields', FieldSchemaMap doesn't
	const tables = {} as NormalizedTables<TTables>;
	for (const [key, value] of Object.entries(input.tables)) {
		(tables as Record<string, TableDefinition>)[key] =
			'fields' in value
				? (value as TableDefinition)
				: normalizeTable(key, value as FieldSchemaMap);
	}

	// Normalize all KV entries
	// KvDefinition has 'field', KvFieldSchema doesn't
	const kv = {} as NormalizedKv<TKv>;
	for (const [key, value] of Object.entries(input.kv)) {
		(kv as Record<string, KvDefinition>)[key] =
			'field' in value
				? (value as KvDefinition)
				: normalizeKv(key, value as KvFieldSchema);
	}

	return {
		id: input.id,
		name: input.name ?? humanizeString(input.id),
		tables,
		kv,
	};
}

/**
 * Define a collaborative workspace with YJS-first architecture.
 *
 * A workspace is a self-contained domain module with tables and capabilities.
 * This function returns a **static definition** with a `.create()` method to
 * instantiate **runtime clients**.
 *
 * Accepts a `WorkspaceInput` which can be either:
 * - **Minimal**: just id + field schemas (metadata auto-generated)
 * - **Full**: complete with name, icons, descriptions
 *
 * When using minimal input, defaults are applied:
 * - `name`: humanized from ID (e.g., "epicenter.blog" → "Epicenter blog")
 * - Table `name`: humanized from key (e.g., "blogPosts" → "Blog posts")
 * - Table `icon`: default emoji 📄
 * - Table `description`: empty string
 *
 * @example Minimal input (developer ergonomics)
 * ```typescript
 * const workspace = defineWorkspace({
 *   id: 'epicenter.blog',
 *   tables: {
 *     posts: { id: id(), title: text(), published: boolean({ default: false }) },
 *   },
 *   kv: {},
 * });
 * // workspace.name === 'Epicenter blog'
 * // workspace.tables.posts.name === 'Posts'
 * ```
 *
 * @example Full input (explicit metadata)
 * ```typescript
 * const workspace = defineWorkspace({
 *   id: 'epicenter.blog',
 *   name: 'My Blog',
 *   tables: {
 *     posts: {
 *       name: 'Blog Posts',
 *       icon: { type: 'emoji', value: '📝' },
 *       cover: null,
 *       description: 'All blog posts',
 *       fields: { id: id(), title: text() },
 *     },
 *   },
 *   kv: {},
 * });
 * ```
 *
 * @param input - Workspace input (minimal or full)
 * @returns A Workspace definition with a `.create()` method
 */
export function defineWorkspace<
	const TTables extends Record<string, FieldSchemaMap | TableDefinition>,
	const TKv extends Record<string, KvFieldSchema | KvDefinition> = Record<
		string,
		never
	>,
>(
	input: WorkspaceInput<TTables, TKv>,
): Workspace<NormalizedTables<TTables>, NormalizedKv<TKv>> {
	if (!input.id || typeof input.id !== 'string') {
		throw new Error('Workspace must have a valid ID');
	}

	// Normalize the input to a full definition
	const normalized = normalizeWorkspaceInput(input);

	return {
		...normalized,

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
		 * 2. **Definition merged** — Workspace definition (name, tables, kv) is
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
				NormalizedTables<TTables>,
				NormalizedKv<TKv>
			> = {},
		>({
			epoch = 0,
			capabilities: capabilityFactories = {} as TCapabilityFactories,
		}: {
			epoch?: number;
			capabilities?: TCapabilityFactories;
		} = {}): WorkspaceClient<
			NormalizedTables<TTables>,
			NormalizedKv<TKv>,
			InferCapabilityExports<TCapabilityFactories>
		> {
			// Create Workspace Y.Doc with deterministic GUID
			// gc: false is required for revision history snapshots to work
			const docId = `${normalized.id}-${epoch}` as const;
			const ydoc = new Y.Doc({ guid: docId, gc: false });

			// Y.Doc contains DATA ONLY (table rows, kv values)
			// Definition/metadata is static and comes from the normalized config

			// Create table and kv helpers bound to the Y.Doc
			const tables = createTables(ydoc, normalized.tables);
			const kv = createKv(ydoc, normalized.kv);

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
							id: normalized.id,
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
				id: normalized.id,
				// Name comes from static definition, not Y.Doc
				name: normalized.name,
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
// NOTE: Definition storage in Y.Doc has been removed
// ─────────────────────────────────────────────────────────────────────────────
//
// Previously, workspace metadata (name, table icons, etc.) was stored
// in a 'definition' Y.Map inside the Y.Doc. This added CRDT overhead for data
// that rarely changes.
//
// Now:
// - Y.Doc contains DATA ONLY (table rows, kv values)
// - Definition/metadata is static and comes from:
//   - Code: the normalized WorkspaceDefinition from defineWorkspace()
//   - Epicenter app: a definition.json file
//
// See specs/20260117T004421-workspace-input-normalization.md for details.
