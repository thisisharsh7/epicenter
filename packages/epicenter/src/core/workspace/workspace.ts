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
 * │   │ • id                │  extensions  │  • Y.Doc instance   │              │
 * │   │ • name              │              │  • tables helpers   │              │
 * │   │                     │              │  • kv helpers       │              │
 * │   │ • tables schema     │              │  • extensions       │              │
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
 * const client = createClient(definition, { extensions: { sqlite } });
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
 * - {@link ../extension.ts} - Extension factory types
 * - {@link ../docs/head-doc.ts} - Head Doc for epoch management
 * - {@link ../docs/registry-doc.ts} - Registry Doc for workspace discovery
 * - {@link ./node.ts} - Node.js async wrapper
 *
 * @module
 */

import humanizeString from 'humanize-string';
import * as Y from 'yjs';
import {
	getWorkspaceDocMaps,
	mergeDefinitionIntoYDoc,
	readDefinitionFromYDoc,
	type WorkspaceDefinitionMap,
} from '../docs/workspace-doc';
import type { ExtensionFactoryMap, InferExtensionExports } from '../extension';
import { createKv, type Kv } from '../kv/core';
import { defineExports, type Lifecycle } from '../lifecycle';

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
 * Builder for creating workspace clients with proper type inference.
 *
 * The builder pattern solves TypeScript's limitation with simultaneous generic
 * inference. By splitting client creation into sequential method calls, TypeScript
 * can infer types step-by-step.
 *
 * ## Two Paths
 *
 * ```
 *                     createClient(workspaceId, { epoch? })
 *                               │
 *                               ▼
 *               ┌───────────────┴───────────────┐
 *               │                               │
 *               ▼                               ▼
 *      .withDefinition(def)              .withExtensions({})
 *               │                               │
 *               │                               │
 *               ▼                               ▼
 *      .withExtensions({})               WorkspaceClient
 *               │                        (dynamic schema)
 *               │
 *               ▼
 *        WorkspaceClient
 *        (static schema)
 * ```
 *
 * **Path 1: Static Schema (Code-Defined)**
 *
 * For apps like Whispering where schema is defined in code:
 *
 * ```typescript
 * const client = createClient(definition.id)
 *   .withDefinition(definition)
 *   .withExtensions({
 *     persistence: (ctx) => persistence(ctx, { filePath }),
 *     //            ^^^ ctx: ExtensionContext<typeof definition.tables, typeof definition.kv>
 *   });
 * ```
 *
 * **Path 2: Dynamic Schema (Y.Doc-Defined)**
 *
 * For the Epicenter app where schema lives in the Y.Doc:
 *
 * ```typescript
 * const client = createClient('my-workspace')
 *   .withExtensions({
 *     persistence: (ctx) => persistence(ctx, { filePath }),
 *     //            ^^^ ctx: ExtensionContext<TableDefinitionMap, KvDefinitionMap> (generic)
 *   });
 * ```
 *
 * **Without Extensions**
 *
 * Pass an empty object to `.withExtensions()`:
 *
 * ```typescript
 * const client = createClient(definition.id)
 *   .withDefinition(definition)
 *   .withExtensions({});
 * ```
 */
export type ClientBuilder<
	TTableDefinitionMap extends TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap,
> = {
	/**
	 * Attach a workspace definition for static schema mode.
	 *
	 * This locks in the table/kv types from the definition, enabling
	 * proper type inference for extensions.
	 *
	 * @example
	 * ```typescript
	 * const client = createClient(definition.id)
	 *   .withDefinition(definition)
	 *   .withExtensions({
	 *     persistence: (ctx) => persistence(ctx, { filePath }),
	 *   });
	 * ```
	 */
	withDefinition<
		TDefTables extends TableDefinitionMap,
		TDefKv extends KvDefinitionMap,
	>(
		definition: WorkspaceDefinition<TDefTables, TDefKv>,
	): ClientBuilder<TDefTables, TDefKv>;

	/**
	 * Attach extensions and create the client.
	 *
	 * This is the terminal operation that creates the actual WorkspaceClient.
	 * Extensions receive properly typed context with table and kv definitions.
	 *
	 * Pass an empty object `{}` if you don't need any extensions.
	 *
	 * @example
	 * ```typescript
	 * // With extensions
	 * const client = createClient(definition.id)
	 *   .withDefinition(definition)
	 *   .withExtensions({
	 *     persistence: (ctx) => persistence(ctx, { filePath }),
	 *     sqlite: (ctx) => sqlite(ctx, { dbPath }),
	 *   });
	 *
	 * await client.whenSynced;
	 * client.tables.recordings.upsert({ ... });
	 *
	 * // Without extensions
	 * const client = createClient(definition.id)
	 *   .withDefinition(definition)
	 *   .withExtensions({});
	 * ```
	 */
	withExtensions<
		TExtensionFactories extends ExtensionFactoryMap<
			TTableDefinitionMap,
			TKvDefinitionMap
		>,
	>(
		extensions: TExtensionFactories,
	): WorkspaceClient<
		TTableDefinitionMap,
		TKvDefinitionMap,
		InferExtensionExports<TExtensionFactories>
	>;
};

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
 * const client = workspace.create({ epoch, extensions });
 *
 * // New API
 * const definition = defineWorkspace({ id, tables, kv });
 * const client = createClient(definition, { epoch, extensions });
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
 * - Access extension exports via `client.extensions.extensionId`
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
	TExtensionExports extends Record<string, Lifecycle> = Record<
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
	/** Exports from initialized extensions. */
	extensions: TExtensionExports;
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
	 * Resolves when all extensions are initialized and ready.
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
	/** Clean up resources (close extensions, destroy YJS doc). */
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
 *   extensions: { sqlite, persistence },
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

// ─────────────────────────────────────────────────────────────────────────────
// Public API: createClient with Builder Pattern
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a client builder for a workspace.
 *
 * Returns a {@link ClientBuilder} for chaining `.withDefinition()` and `.withExtensions()`.
 * The client is only created when you call `.withExtensions()` (the terminal operation).
 *
 * ## Two Paths
 *
 * ```
 *                     createClient(workspaceId, { epoch? })
 *                               │
 *                               ▼
 *               ┌───────────────┴───────────────┐
 *               │                               │
 *               ▼                               ▼
 *      .withDefinition(def)              .withExtensions({})
 *               │                               │
 *               │                               │
 *               ▼                               ▼
 *      .withExtensions({})               WorkspaceClient
 *               │                        (dynamic schema)
 *               │
 *               ▼
 *        WorkspaceClient
 *        (static schema)
 * ```
 *
 * ## Path 1: Static Schema (Code-Defined)
 *
 * For apps like Whispering where schema is defined in code:
 *
 * ```typescript
 * const definition = defineWorkspace({
 *   id: 'epicenter.whispering',
 *   tables: { recordings: { id: id(), title: text() } },
 *   kv: {},
 * });
 *
 * const client = createClient(definition.id)
 *   .withDefinition(definition)
 *   .withExtensions({
 *     persistence: (ctx) => persistence(ctx, { filePath }),
 *     //            ^^^ ctx: ExtensionContext<typeof definition.tables, typeof definition.kv>
 *   });
 *
 * await client.whenSynced;
 * client.tables.recordings.upsert({ ... });
 * ```
 *
 * ## Path 2: Dynamic Schema (Y.Doc-Defined)
 *
 * For the Epicenter app where schema lives in the Y.Doc:
 *
 * ```typescript
 * const client = createClient('my-workspace', { epoch: 2 })
 *   .withExtensions({
 *     persistence: (ctx) => persistence(ctx, { filePath }),
 *     //            ^^^ ctx: ExtensionContext<TableDefinitionMap, KvDefinitionMap> (generic)
 *   });
 *
 * await client.whenSynced;
 * // Schema is read from Y.Doc after persistence loads
 * ```
 *
 * ## Without Extensions
 *
 * Pass an empty object to `.withExtensions()`:
 *
 * ```typescript
 * const client = createClient(definition.id)
 *   .withDefinition(definition)
 *   .withExtensions({});
 * ```
 *
 * @param workspaceId - The workspace identifier (e.g., "epicenter.whispering")
 * @param options - Optional configuration
 * @param options.epoch - Workspace Doc version (defaults to 0)
 */
export function createClient(
	workspaceId: string,
	options: { epoch?: number } = {},
): ClientBuilder<TableDefinitionMap, KvDefinitionMap> {
	const epoch = options.epoch ?? 0;

	return createClientBuilder({
		id: workspaceId,
		epoch,
		tables: {} as TableDefinitionMap,
		kv: {} as KvDefinitionMap,
		onSync: undefined,
		fallbackName: undefined,
	});
}

/**
 * Internal: Create a ClientBuilder from builder config.
 */
function createClientBuilder<
	TTableDefinitionMap extends TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap,
>(config: {
	id: string;
	epoch: number;
	tables: TTableDefinitionMap;
	kv: TKvDefinitionMap;
	onSync:
		| ((
				definitionMap: ReturnType<typeof getWorkspaceDocMaps>['definition'],
		  ) => void)
		| undefined;
	fallbackName: string | undefined;
}): ClientBuilder<TTableDefinitionMap, TKvDefinitionMap> {
	return {
		withDefinition<
			TDefTables extends TableDefinitionMap,
			TDefKv extends KvDefinitionMap,
		>(
			definition: WorkspaceDefinition<TDefTables, TDefKv>,
		): ClientBuilder<TDefTables, TDefKv> {
			return createClientBuilder({
				id: config.id,
				epoch: config.epoch,
				tables: definition.tables,
				kv: definition.kv,
				onSync: (definitionMap) => {
					mergeDefinitionIntoYDoc(definitionMap, definition);
				},
				fallbackName: definition.name,
			});
		},

		withExtensions<
			TExtensionFactories extends ExtensionFactoryMap<
				TTableDefinitionMap,
				TKvDefinitionMap
			>,
		>(
			extensions: TExtensionFactories,
		): WorkspaceClient<
			TTableDefinitionMap,
			TKvDefinitionMap,
			InferExtensionExports<TExtensionFactories>
		> {
			return createClientCore({
				...config,
				extensionFactories: extensions,
			});
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: Core Client Creation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Internal core function for creating workspace clients.
 *
 * The key difference between static and dynamic schema:
 * - Static schema: merges definition after persistence loads (onSync provided)
 * - Dynamic schema: no merge, schema comes from Y.Doc (onSync undefined)
 */
function createClientCore<
	TTableDefinitionMap extends TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap,
	TExtensionFactories extends ExtensionFactoryMap<
		TTableDefinitionMap,
		TKvDefinitionMap
	>,
>({
	id,
	epoch,
	extensionFactories,
	tables: tableDefinitions,
	kv: kvDefinitions,
	onSync,
	fallbackName,
}: {
	id: string;
	epoch: number;
	extensionFactories: TExtensionFactories;
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
	InferExtensionExports<TExtensionFactories>
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

	// Initialize extensions synchronously — async work is in their whenSynced
	const extensions = {} as InferExtensionExports<TExtensionFactories>;
	for (const [extensionId, extensionFactory] of Object.entries(
		extensionFactories,
	)) {
		// Factory is sync; normalize exports at boundary
		const result = extensionFactory({
			id,
			extensionId,
			ydoc,
			tables,
			kv,
		});
		const exports = defineExports(result as Record<string, unknown>);
		(extensions as Record<string, unknown>)[extensionId] = exports;
	}

	// Aggregate all extension whenSynced promises
	// Fail-fast: any rejection rejects the whole thing (UI shows error state)
	//
	// ORDER OF OPERATIONS (critical for correctness):
	// 1. Wait for all extensions' whenSynced (e.g., persistence finishes loading disk state)
	// 2. THEN run onSync callback (static schema merges definition here)
	// 3. Resolve whenSynced
	//
	// See: specs/20260119T231252-resilient-client-architecture.md
	const whenSynced = Promise.all(
		Object.values(extensions).map((e) => (e as Lifecycle).whenSynced),
	).then(() => {
		// After persistence has loaded disk state, run the sync callback
		// Static schema: merges definition (code is "last writer")
		// Dynamic schema: no-op (schema comes from Y.Doc)
		onSync?.(definitionMap);
	});

	const destroy = async () => {
		// Use allSettled so one destroy failure doesn't block others
		await Promise.allSettled(
			Object.values(extensions).map((e) => (e as Lifecycle).destroy()),
		);
		// Always release doc resources
		ydoc.destroy();
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
		extensions,
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
