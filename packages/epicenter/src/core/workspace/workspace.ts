/**
 * Workspace definition and creation for YJS-first collaborative workspaces.
 *
 * This module provides the core workspace API:
 * - {@link defineWorkspace} - Factory to create workspace definitions
 * - {@link createClient} - Factory to create runtime clients from definitions
 * - {@link WorkspaceClient} - The runtime client for interacting with data
 *
 * ## Architecture Overview
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Two-Phase Initialization                                                   │
 * │                                                                             │
 * │   defineWorkspace(config)              createClient(definition, options)    │
 * │   ─────────────────────────            ─────────────────────────────────    │
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
 * - `createClient()` returns **immediately** with a client object
 * - Async initialization (persistence, sync) tracked via `client.whenSynced`
 * - UI frameworks use `whenSynced` as a render gate
 *
 * ```typescript
 * // Sync construction - returns immediately
 * const client = createClient(definition, { capabilities: { sqlite } });
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
import {
	getWorkspaceDocMaps,
	mergeDefinitionIntoYDoc,
	readDefinitionFromYDoc,
	type WorkspaceDefinitionMap,
} from '../docs/workspace-doc';
import { createKv, type Kv } from '../kv/core';
import { defineExports, type Lifecycle, type MaybePromise } from '../lifecycle';

import type {
	KvDefinition,
	KvDefinitionMap,
	KvSchemaMap,
	TableDefinitionMap,
} from '../schema/fields/types';
import { createTables, type Tables } from '../tables/create-tables';
import { normalizeKv } from './normalize';

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
 * When you call `createClient()`, these values are **merged** into the Y.Doc's
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
 * const definition = defineWorkspace({
 *   id: 'epicenter.blog',   // human-readable ID
 *   name: 'My Blog',        // initial name
 *   tables: { posts: {...} },
 *   kv: {},
 * });
 *
 * // After creation, name is live CRDT state
 * const client = createClient(definition);
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
 * @deprecated Use `WorkspaceDefinition` instead. The `.create()` method has been
 * extracted to a standalone `createClient()` function.
 *
 * Migration:
 * ```typescript
 * // Old API
 * const workspace = defineWorkspace({ id, tables, kv });
 * const client = workspace.create({ epoch, capabilities });
 *
 * // New API
 * const definition = defineWorkspace({ id, tables, kv });
 * const client = createClient(definition, { epoch, capabilities });
 * ```
 */
export type Workspace<
	TTableDefinitionMap extends TableDefinitionMap = TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap = KvDefinitionMap,
> = WorkspaceDefinition<TTableDefinitionMap, TKvDefinitionMap>;

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
 * const client = createClient(definition);
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
 *   await using client = createClient(definition);
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
	 * Read the current definition from the Y.Doc.
	 *
	 * Returns the workspace definition including name, icon, tables, and kv schemas.
	 * This is a live read from the CRDT state, so it reflects real-time changes.
	 *
	 * @example
	 * ```typescript
	 * const definition = client.getDefinition();
	 * console.log(definition.name);  // "My Blog"
	 * console.log(definition.tables.posts);  // { name: 'Posts', fields: {...} }
	 * ```
	 */
	getDefinition(): WorkspaceDefinitionMap;
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
 * Input type for `defineWorkspace()`.
 *
 * Tables must be `TableDefinition` objects. Use the `table()` helper for ergonomic
 * table definitions—it requires `name` and `fields`, with optional `description` and `icon`.
 *
 * After normalization, this becomes a `WorkspaceDefinition` (the canonical form).
 * The only normalization performed is:
 * - Workspace `name` derived from `id` via humanization
 * - KV metadata auto-generated from keys
 *
 * @example
 * ```typescript
 * const definition = defineWorkspace({
 *   id: 'epicenter.blog',
 *   tables: {
 *     posts: table({
 *       name: 'Posts',
 *       description: 'Blog posts and articles',
 *       icon: '📝',
 *       fields: { id: id(), title: text(), published: boolean({ default: false }) },
 *     }),
 *   },
 *   kv: {
 *     theme: select({ options: ['light', 'dark'] as const, default: 'light' }),
 *   },
 * });
 * // definition.name === 'Epicenter blog' (derived from id)
 * ```
 */
export type WorkspaceInput<
	TTables extends TableDefinitionMap = TableDefinitionMap,
	TKv extends KvSchemaMap = KvSchemaMap,
> = {
	/** Workspace identifier (e.g., "epicenter.blog"). Name is derived from this. */
	id: string;
	/** Tables created with `table()` helper. Each table requires name and fields. */
	tables: TTables;
	/** KV entries as field schemas. Metadata is auto-generated. */
	kv: TKv;
};

/**
 * Type-level normalization for KV entries.
 *
 * Converts a map of KV field schemas into a map of `KvDefinition`.
 * This ensures the output type is always the canonical form.
 *
 * @example
 * ```typescript
 * // Input: { theme: select({ options: ['light', 'dark'] }) }
 * // NormalizedKv<...> = { theme: KvDefinition<SelectFieldSchema<...>> }
 * ```
 */
export type NormalizedKv<TKv extends KvSchemaMap> = {
	[K in keyof TKv]: KvDefinition<TKv[K]>;
};

/**
 * Normalize a workspace input to a full WorkspaceDefinition.
 *
 * Tables are passed through unchanged (they're already `TableDefinition`).
 * - Workspace name is derived from id via humanization
 * - KV metadata is auto-generated from keys
 */
function normalizeWorkspaceInput<
	TTables extends TableDefinitionMap,
	TKv extends KvSchemaMap,
>(
	input: WorkspaceInput<TTables, TKv>,
): WorkspaceDefinition<TTables, NormalizedKv<TKv>> {
	// Normalize all KV entries (field schemas → full definitions)
	const kv = {} as NormalizedKv<TKv>;
	for (const [key, field] of Object.entries(input.kv)) {
		(kv as Record<string, KvDefinition>)[key] = normalizeKv(key, field);
	}

	return {
		id: input.id,
		name: humanizeString(input.id),
		tables: input.tables,
		kv,
	};
}

/**
 * Define a collaborative workspace with YJS-first architecture.
 *
 * Takes table definitions (via `table()` helper) and returns a complete
 * `WorkspaceDefinition`.
 *
 * This is a **pure normalization** function. It performs no I/O and returns
 * a JSON-serializable definition. To create a runtime client, pass the
 * definition to `createClient()`.
 *
 * **Normalization performed:**
 * - Workspace `name`: humanized from ID (e.g., "epicenter.blog" → "Epicenter blog")
 * - KV metadata: auto-generated from keys
 *
 * **Tables are passed through unchanged** — use `table()` helper which handles
 * normalization (requires `name` and `fields`, optional `description` and `icon`).
 *
 * @example Define and create client
 * ```typescript
 * // Step 1: Define workspace
 * const definition = defineWorkspace({
 *   id: 'epicenter.blog',
 *   tables: {
 *     posts: table({
 *       name: 'Posts',
 *       description: 'Blog posts and articles',
 *       icon: '📝',
 *       fields: { id: id(), title: text(), published: boolean({ default: false }) },
 *     }),
 *   },
 *   kv: {
 *     theme: select({ options: ['light', 'dark'] as const, default: 'light' }),
 *   },
 * });
 * // definition.name === 'Epicenter blog'
 *
 * // Step 2: Create client (runtime)
 * const client = createClient(definition, {
 *   capabilities: { sqlite, persistence },
 * });
 * await client.whenSynced;
 * ```
 *
 * @param input - Workspace input with table definitions
 * @returns A WorkspaceDefinition (JSON-serializable)
 */
export function defineWorkspace<
	const TTables extends TableDefinitionMap,
	const TKv extends KvSchemaMap = Record<string, never>,
>(
	input: WorkspaceInput<TTables, TKv>,
): WorkspaceDefinition<TTables, NormalizedKv<TKv>> {
	if (!input.id || typeof input.id !== 'string') {
		throw new Error('Workspace must have a valid ID');
	}

	// Normalize the input to a full definition
	return normalizeWorkspaceInput(input);
}

/**
 * Create a runtime client from a workspace definition (sync construction).
 *
 * Returns immediately with a usable client. Capabilities are initialized
 * in the background; use `client.whenSynced` to await full initialization.
 *
 * ## Two-Phase Initialization
 *
 * 1. `defineWorkspace()` creates a static definition (schema + metadata)
 * 2. `createClient()` creates a runtime client (Y.Doc + helpers + capabilities)
 *
 * ## What happens during creation
 *
 * 1. **Y.Doc created** — A new YJS document with GUID `{id}-{epoch}`.
 *    The epoch creates isolated document namespaces for versioning/sync.
 *
 * 2. **Helpers created** — Typed `tables` and `kv` helpers are bound to
 *    the Y.Doc for CRUD operations.
 *
 * 3. **Capabilities started** — Factory functions run in parallel (without blocking).
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
 * - **Multiple clients are independent**: Calling `createClient()` twice
 *   returns two separate Y.Docs and clients. They don't share state
 *   unless connected via sync capabilities.
 *
 * @param definition - A WorkspaceDefinition from `defineWorkspace()` or loaded from JSON
 * @param options - Optional configuration
 * @param options.epoch - Workspace Doc version (defaults to 0). The Y.Doc GUID
 *   is `{workspaceId}-{epoch}`. Change this intentionally to create a
 *   separate document namespace (e.g., for migrations or sync isolation).
 * @param options.capabilities - Factory functions that add features like
 *   persistence, sync, or SQL queries.
 *
 * @example Sync construction with render gate
 * ```typescript
 * const definition = defineWorkspace({ id: 'blog', tables: {...}, kv: {} });
 * const client = createClient(definition, {
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
 * @example With epoch from Head Doc
 * ```typescript
 * const head = createHeadDoc({ workspaceId: definition.id });
 * const epoch = head.getEpoch();
 * const client = createClient(definition, {
 *   epoch,
 *   capabilities: { sqlite, persistence },
 * });
 * await client.whenSynced;
 * ```
 *
 * @example Loading definition from JSON
 * ```typescript
 * const definition = JSON.parse(await readFile('workspace.json', 'utf-8'));
 * const client = createClient(definition, { capabilities });
 * await client.whenSynced;
 * ```
 *
 */
export function createClient<
	TTableDefinitionMap extends TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap,
	TCapabilityFactories extends CapabilityFactoryMap<
		TTableDefinitionMap,
		TKvDefinitionMap
	> = Record<string, never>,
>(
	definition: WorkspaceDefinition<TTableDefinitionMap, TKvDefinitionMap>,
	{
		epoch = 0,
		capabilities: capabilityFactories = {} as TCapabilityFactories,
	}: {
		epoch?: number;
		capabilities?: TCapabilityFactories;
	} = {},
): WorkspaceClient<
	TTableDefinitionMap,
	TKvDefinitionMap,
	InferCapabilityExports<TCapabilityFactories>
> {
	return createClientCore({
		id: definition.id,
		epoch,
		capabilityFactories,
		tables: definition.tables,
		kv: definition.kv,
		// Static schema mode: merge the definition after persistence loads
		onSync: (definitionMap) => {
			mergeDefinitionIntoYDoc(definitionMap, definition);
		},
		// Fallback name from definition
		fallbackName: definition.name,
	});
}

/**
 * Create a workspace client for dynamic schema mode (Epicenter app).
 *
 * Use this when the schema lives in the Y.Doc itself, not in code.
 * Only the workspace ID is required; name, tables, and kv are read from
 * the Y.Doc after persistence loads.
 *
 * For static schema apps (like Whispering), use {@link createClient} instead.
 *
 * @param workspaceId - The workspace identifier
 * @param options - Configuration options
 * @param options.epoch - Workspace Doc version (defaults to 0)
 * @param options.capabilities - Factory functions for persistence, sync, etc.
 *
 * @example
 * ```typescript
 * // Dynamic schema - schema comes from Y.Doc
 * const client = createDynamicClient('my-workspace', {
 *   epoch,
 *   capabilities: { persistence },
 * });
 * await client.whenSynced;
 *
 * // Name and schema are read from Y.Doc
 * console.log(client.name);
 * ```
 */
export function createDynamicClient<
	TCapabilityFactories extends CapabilityFactoryMap<
		TableDefinitionMap,
		KvDefinitionMap
	> = Record<string, never>,
>(
	workspaceId: string,
	{
		epoch = 0,
		capabilities: capabilityFactories = {} as TCapabilityFactories,
	}: {
		epoch?: number;
		capabilities?: TCapabilityFactories;
	} = {},
): WorkspaceClient<
	TableDefinitionMap,
	KvDefinitionMap,
	InferCapabilityExports<TCapabilityFactories>
> {
	return createClientCore({
		id: workspaceId,
		epoch,
		capabilityFactories,
		tables: {} as TableDefinitionMap,
		kv: {} as KvDefinitionMap,
		// Dynamic schema mode: don't merge anything, schema comes from Y.Doc
		onSync: undefined,
		// No fallback name - read from Y.Doc
		fallbackName: undefined,
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: Core Client Creation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Internal core function for creating workspace clients.
 *
 * Both `createClient` (static schema) and `createDynamicClient` (dynamic schema)
 * use this function. The key difference is the `onSync` callback:
 * - Static schema: merges definition after persistence loads
 * - Dynamic schema: no merge, schema comes from Y.Doc
 */
function createClientCore<
	TTableDefinitionMap extends TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap,
	TCapabilityFactories extends CapabilityFactoryMap<
		TTableDefinitionMap,
		TKvDefinitionMap
	>,
>({
	id,
	epoch,
	capabilityFactories,
	tables: tableDefinitions,
	kv: kvDefinitions,
	onSync,
	fallbackName,
}: {
	id: string;
	epoch: number;
	capabilityFactories: TCapabilityFactories;
	tables: TTableDefinitionMap;
	kv: TKvDefinitionMap;
	/** Called after persistence loads. Static schema uses this to merge definition. */
	onSync:
		| ((
				definitionMap: ReturnType<typeof getWorkspaceDocMaps>['definition'],
		  ) => void)
		| undefined;
	/** Fallback name if Y.Doc doesn't have one yet. */
	fallbackName: string | undefined;
}): WorkspaceClient<
	TTableDefinitionMap,
	TKvDefinitionMap,
	InferCapabilityExports<TCapabilityFactories>
> {
	// Create Workspace Y.Doc with deterministic GUID
	// gc: false is required for revision history snapshots to work
	const docId = `${id}-${epoch}` as const;
	const ydoc = new Y.Doc({ guid: docId, gc: false });

	// Get the definition Y.Map for storing schema metadata
	const { definition: definitionMap } = getWorkspaceDocMaps(ydoc);

	// NOTE: We do NOT call mergeDefinitionIntoYDoc() here!
	// It must happen AFTER persistence loads (inside whenSynced) so that
	// code-defined values are "last writer" and override stale disk values.
	// See: specs/20260119T231252-resilient-client-architecture.md

	// Create table and kv helpers bound to the Y.Doc
	// These can be created immediately - they just bind to Y.Maps
	const tables = createTables(ydoc, tableDefinitions);
	const kv = createKv(ydoc, kvDefinitions);

	// Initialize capability exports object and tracking arrays
	const capabilities = {} as InferCapabilityExports<TCapabilityFactories>;
	const initPromises: Promise<void>[] = [];

	// Pre-seed capabilities with placeholder lifecycle so runtime matches type shape.
	// Also create destroy functions that reference current exports (handles late binding).
	const destroyFns: Array<() => MaybePromise<void>> = [];
	for (const capabilityId of Object.keys(capabilityFactories)) {
		(capabilities as Record<string, unknown>)[capabilityId] = defineExports();
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
					id,
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
	//
	// ORDER OF OPERATIONS (critical for correctness):
	// 1. Wait for capability factories to complete
	// 2. Wait for all capabilities' whenSynced (e.g., persistence finishes loading disk state)
	// 3. THEN run onSync callback (static schema merges definition here)
	// 4. Resolve whenSynced
	//
	// See: specs/20260119T231252-resilient-client-architecture.md
	const whenSynced = whenCapabilitiesInitializedSettled
		.then(() =>
			Promise.all(
				Object.values(capabilities).map((c) => (c as Lifecycle).whenSynced),
			),
		)
		.then(() => {
			// After persistence has loaded disk state, run the sync callback
			// Static schema: merges definition (code is "last writer")
			// Dynamic schema: no-op (schema comes from Y.Doc)
			onSync?.(definitionMap);
		});

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
		id,
		// Name is a live getter from Y.Map('definition')
		// Falls back to provided fallbackName if not yet synced
		get name() {
			return (definitionMap.get('name') as string) ?? fallbackName ?? '';
		},
		ydoc,
		tables,
		kv,
		capabilities,
		getDefinition() {
			return readDefinitionFromYDoc(definitionMap);
		},
		whenSynced,
		destroy,
		[Symbol.asyncDispose]: destroy,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Y.Doc Structure: Three Top-Level Maps
// ─────────────────────────────────────────────────────────────────────────────
//
// Each workspace Y.Doc has three top-level Y.Maps:
//
// Y.Map('definition') - Schema metadata (rarely changes)
//   └── name: string
//   └── icon: IconDefinition | null
//   └── tables: Y.Map<tableName, { name, icon, description, fields }>
//   └── kv: Y.Map<keyName, { name, icon, description, field }>
//
// Y.Map('kv') - Settings values (changes occasionally)
//   └── [key]: value
//
// Y.Map('tables') - Table data (changes frequently)
//   └── [tableName]: Y.Map<rowId, Y.Map<fieldName, value>>
//
// This enables:
// - Independent observation (no observeDeep needed)
// - Different persistence strategies per map
// - Collaborative schema editing via Y.Map('definition')
//
// See specs/20260119T150426-workspace-storage-architecture.md for details.
