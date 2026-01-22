/**
 * Workspace definition and creation for YJS-first collaborative workspaces.
 *
 * This module provides the core workspace API:
 * - {@link defineSchema} - Type inference helper for workspace schemas (pass-through)
 * - {@link createClient} - Factory to create workspaces with builder pattern
 * - {@link WorkspaceDoc} - The unified workspace abstraction (from workspace-doc.ts)
 * - {@link WorkspaceSchema} - Schema type for `.withSchema()` (tables + kv only)
 *
 * ## Architecture Overview
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Builder Pattern Initialization                                             │
 * │                                                                             │
 * │   createClient(head)                                                        │
 * │         │                                                                   │
 * │         ▼                                                                   │
 * │         ┌───────────┴───────────┐                                           │
 * │         │                       │                                           │
 * │         ▼                       ▼                                           │
 * │   .withSchema(schema)    .withExtensions({})                                │
 * │         │                       │                                           │
 * │         ▼                       ▼                                           │
 * │   .withExtensions({})    WorkspaceDoc                                       │
 * │         │                (dynamic schema)                                   │
 * │         ▼                                                                   │
 * │   WorkspaceDoc                                                              │
 * │   (static schema)                                                           │
 * └─────────────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Sync Construction Pattern
 *
 * This module implements the "sync construction, async property" pattern:
 *
 * - `createClient()` returns **immediately** with a workspace object
 * - Async initialization (persistence, sync) tracked via `workspace.whenSynced`
 * - UI frameworks use `whenSynced` as a render gate
 *
 * ```typescript
 * // Create head doc first (manages epoch)
 * const head = createHeadDoc({ workspaceId: 'blog', providers: {} });
 *
 * // Sync construction - returns immediately
 * const workspace = createClient(head)
 *   .withSchema({ tables: {...}, kv: {} })
 *   .withExtensions({ persistence });
 *
 * // Sync access works immediately (operates on in-memory Y.Doc)
 * workspace.tables.posts.upsert({ id: '1', title: 'Hello' });
 *
 * // Await when you need initialization complete
 * await workspace.whenSynced;
 * ```
 *
 * For Node.js scripts that prefer async semantics, see {@link ./node.ts}.
 *
 * ## Related Modules
 *
 * - {@link ../lifecycle.ts} - Lifecycle protocol (`whenSynced`, `destroy`)
 * - {@link ../extension.ts} - Extension factory types
 * - {@link ../docs/head-doc.ts} - Head Doc for workspace identity and epoch
 * - {@link ../docs/registry-doc.ts} - Registry Doc for workspace discovery
 * - {@link ../docs/workspace-doc.ts} - WorkspaceDoc type definition
 * - {@link ./node.ts} - Node.js async wrapper
 *
 * @module
 */

import type { HeadDoc } from '../docs/head-doc';
import {
	createWorkspaceDoc,
	type ExtensionFactoryMap,
	type InferExtensionExports,
	type WorkspaceDoc,
} from '../docs/workspace-doc';

import type {
	KvDefinitionMap,
	TableDefinitionMap,
} from '../schema/fields/types';

// ─────────────────────────────────────────────────────────────────────────────
// Public API: Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Workspace schema containing just tables and KV definitions.
 *
 * This is the minimal schema needed for `withSchema()`. It does NOT include
 * workspace identity (id, name, icon, description) which now lives in Head Doc.
 *
 * @example
 * ```typescript
 * const head = createHeadDoc({ workspaceId: 'blog', providers: {} });
 * const client = createClient(head)
 *   .withSchema({
 *     tables: { posts: table({ name: 'Posts', fields: { id: id(), title: text() } }) },
 *     kv: {},
 *   })
 *   .withExtensions({ persistence });
 * ```
 */
export type WorkspaceSchema<
	TTableDefinitionMap extends TableDefinitionMap = TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap = KvDefinitionMap,
> = {
	/** Table definitions with metadata (name, icon, cover, description, fields). */
	tables: TTableDefinitionMap;
	/** Key-value store definitions with metadata. */
	kv: TKvDefinitionMap;
};

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
 *                          createClient(head)
 *                               │
 *                               ▼
 *               ┌───────────────┴───────────────┐
 *               │                               │
 *               ▼                               ▼
 *      .withSchema(schema)               .withExtensions({})
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
 * const head = createHeadDoc({ workspaceId: 'whispering', providers: {} });
 * const client = createClient(head)
 *   .withSchema({ tables: {...}, kv: {} })
 *   .withExtensions({
 *     persistence: (ctx) => persistence(ctx, { filePath }),
 *   });
 * ```
 *
 * **Path 2: Dynamic Schema (Y.Doc-Defined)**
 *
 * For the Epicenter app where schema lives in the Y.Doc:
 *
 * ```typescript
 * const head = createHeadDoc({ workspaceId: 'my-workspace', providers: {} });
 * const client = createClient(head)
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
 * const head = createHeadDoc({ workspaceId: 'blog', providers: {} });
 * const client = createClient(head)
 *   .withSchema({ tables: {...}, kv: {} })
 *   .withExtensions({});
 * ```
 */
export type ClientBuilder<
	TTableDefinitionMap extends TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap,
> = {
	/**
	 * Attach a workspace schema for static schema mode.
	 *
	 * This locks in the table/kv types from the schema, enabling
	 * proper type inference for extensions.
	 *
	 * Note: Workspace identity (id, name, icon, description) is now separate
	 * from schema and lives in the Head Doc.
	 *
	 * @example
	 * ```typescript
	 * const head = createHeadDoc({ workspaceId: 'blog', providers: {} });
	 * const client = createClient(head)
	 *   .withSchema({ tables: {...}, kv: {} })
	 *   .withExtensions({
	 *     persistence: (ctx) => persistence(ctx, { filePath }),
	 *   });
	 * ```
	 */
	withSchema<
		TSchemaTables extends TableDefinitionMap,
		TSchemaKv extends KvDefinitionMap,
	>(
		schema: WorkspaceSchema<TSchemaTables, TSchemaKv>,
	): ClientBuilder<TSchemaTables, TSchemaKv>;

	/**
	 * Attach extensions and create the workspace.
	 *
	 * This is the terminal operation that creates the actual WorkspaceDoc.
	 * Extensions receive properly typed context with table and kv definitions.
	 *
	 * Pass an empty object `{}` if you don't need any extensions.
	 *
	 * @example
	 * ```typescript
	 * // With extensions
	 * const head = createHeadDoc({ workspaceId: 'whispering', providers: {} });
	 * const workspace = createClient(head)
	 *   .withSchema({ tables: {...}, kv: {} })
	 *   .withExtensions({
	 *     persistence: (ctx) => persistence(ctx, { filePath }),
	 *     sqlite: (ctx) => sqlite(ctx, { dbPath }),
	 *   });
	 *
	 * await workspace.whenSynced;
	 * workspace.tables.recordings.upsert({ ... });
	 *
	 * // Without extensions
	 * const head = createHeadDoc({ workspaceId: 'blog', providers: {} });
	 * const workspace = createClient(head)
	 *   .withSchema({ tables: {...}, kv: {} })
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
	): WorkspaceDoc<
		TTableDefinitionMap,
		TKvDefinitionMap,
		InferExtensionExports<TExtensionFactories>
	>;
};

/**
 * A workspace definition describes the full configuration for a workspace.
 *
 * This type is fully JSON-serializable and contains no methods or runtime behavior.
 * It includes both the schema (tables, kv) and identity (id, name).
 *
 * ## Initial Values vs Live State
 *
 * When you call `createClient()`, the `tables` and `kv` values are **merged**
 * into the Y.Doc's CRDT state for schema tracking.
 *
 * - `id` — Immutable identity, baked into Y.Doc GUID. Never changes.
 * - `name` — Display name for the workspace.
 * - `tables`, `kv` — Schema definitions; merged into Y.Doc schema map.
 *
 * **Note**: Workspace identity (name, icon, description) now lives in the Head Doc,
 * not in the definition. Use `head.getMeta()` for identity.
 *
 * @example
 * ```typescript
 * const schema = defineSchema({
 *   tables: { posts: table({ name: 'Posts', fields: { id: id(), title: text() } }) },
 *   kv: {},
 * });
 *
 * const head = createHeadDoc({ workspaceId: 'epicenter.blog', providers: {} });
 * const client = createClient(head)
 *   .withSchema(schema)
 *   .withExtensions({ persistence });
 *
 * // Identity comes from Head Doc
 * console.log(head.getMeta().name);  // "My Blog"
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
 * @deprecated Use `WorkspaceDefinition` instead.
 *
 * Migration:
 * ```typescript
 * // Old API
 * const workspace = defineWorkspace({ id, tables, kv });
 * const client = workspace.create({ epoch, extensions });
 *
 * // New API
 * const schema = defineSchema({ tables, kv });
 * const client = createClient(head).withSchema(schema).withExtensions({});
 * ```
 */
export type Workspace<
	TTableDefinitionMap extends TableDefinitionMap = TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap = KvDefinitionMap,
> = WorkspaceDefinition<TTableDefinitionMap, TKvDefinitionMap>;

// WorkspaceClient type has been consolidated into WorkspaceDoc
// See: workspace-doc.ts for the unified WorkspaceDoc type

// ─────────────────────────────────────────────────────────────────────────────
// Public API: Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Define a workspace schema for type inference.
 *
 * This is a simple pass-through function that helps TypeScript infer
 * the schema types. It performs no normalization or transformation.
 *
 * @example
 * ```typescript
 * const schema = defineSchema({
 *   tables: {
 *     posts: table({
 *       name: 'Posts',
 *       fields: { id: id(), title: text(), published: boolean({ default: false }) },
 *     }),
 *   },
 *   kv: {},
 * });
 *
 * const head = createHeadDoc({ workspaceId: 'blog', providers: {} });
 * const client = createClient(head)
 *   .withSchema(schema)
 *   .withExtensions({ persistence });
 * ```
 *
 * @param schema - The workspace schema with tables and kv definitions
 * @returns The same schema, unchanged (for type inference)
 */
export function defineSchema<
	const TTables extends TableDefinitionMap,
	const TKv extends KvDefinitionMap = Record<string, never>,
>(schema: WorkspaceSchema<TTables, TKv>): WorkspaceSchema<TTables, TKv> {
	return schema;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API: createClient with Builder Pattern
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a client builder for a workspace.
 *
 * Returns a {@link ClientBuilder} for chaining `.withSchema()` and `.withExtensions()`.
 * The client is only created when you call `.withExtensions()` (the terminal operation).
 *
 * ## Two Paths
 *
 * ```
 *                          createClient(head)
 *                               │
 *                               ▼
 *               ┌───────────────┴───────────────┐
 *               │                               │
 *               ▼                               ▼
 *      .withSchema(schema)               .withExtensions({})
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
 * const head = createHeadDoc({ workspaceId: 'whispering', providers: {} });
 * const client = createClient(head)
 *   .withSchema({
 *     tables: { recordings: table({ name: 'Recordings', fields: { id: id(), title: text() } }) },
 *     kv: {},
 *   })
 *   .withExtensions({
 *     persistence: (ctx) => persistence(ctx, { filePath }),
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
 * const head = createHeadDoc({ workspaceId: 'my-workspace', providers: {} });
 * head.setOwnEpoch(2); // Time travel to epoch 2
 * const client = createClient(head)
 *   .withExtensions({
 *     persistence: (ctx) => persistence(ctx, { filePath }),
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
 * const head = createHeadDoc({ workspaceId: 'blog', providers: {} });
 * const client = createClient(head)
 *   .withSchema({ tables: {...}, kv: {} })
 *   .withExtensions({});
 * ```
 *
 * @param head - The HeadDoc containing workspace identity and current epoch
 */
export function createClient(
	head: HeadDoc,
): ClientBuilder<TableDefinitionMap, KvDefinitionMap> {
	return createClientBuilder({
		id: head.workspaceId,
		epoch: head.getEpoch(),
		tables: {} as TableDefinitionMap,
		kv: {} as KvDefinitionMap,
	});
}

/**
 * Internal: Create a ClientBuilder from builder config.
 *
 * The builder accumulates `tables` and `kv` definitions through `.withSchema()`.
 * When `.withExtensions()` is called, these are passed to `createWorkspaceDoc()`
 * which handles both creating typed helpers AND merging schema after sync.
 */
function createClientBuilder<
	TTableDefinitionMap extends TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap,
>(config: {
	id: string;
	epoch: number;
	tables: TTableDefinitionMap;
	kv: TKvDefinitionMap;
}): ClientBuilder<TTableDefinitionMap, TKvDefinitionMap> {
	return {
		withSchema<
			TSchemaTables extends TableDefinitionMap,
			TSchemaKv extends KvDefinitionMap,
		>(
			schema: WorkspaceSchema<TSchemaTables, TSchemaKv>,
		): ClientBuilder<TSchemaTables, TSchemaKv> {
			return createClientBuilder({
				id: config.id,
				epoch: config.epoch,
				tables: schema.tables,
				kv: schema.kv,
			});
		},

		withExtensions<
			TExtensionFactories extends ExtensionFactoryMap<
				TTableDefinitionMap,
				TKvDefinitionMap
			>,
		>(
			extensions: TExtensionFactories,
		): WorkspaceDoc<
			TTableDefinitionMap,
			TKvDefinitionMap,
			InferExtensionExports<TExtensionFactories>
		> {
			// createWorkspaceDoc handles both:
			// 1. Creating typed table/kv helpers from definitions
			// 2. Merging schema into Y.Doc after extensions sync
			return createWorkspaceDoc({
				workspaceId: config.id,
				epoch: config.epoch,
				tables: config.tables,
				kv: config.kv,
				extensionFactories: extensions,
			});
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Y.Doc Structure: Three Top-Level Maps
// ─────────────────────────────────────────────────────────────────────────────
//
// HEAD DOC (per workspace, all epochs)
// Y.Map('meta') - Workspace identity
//   └── name: string
//   └── icon: IconDefinition | null
//   └── description: string
// Y.Map('epochs') - Epoch tracking
//   └── [clientId]: number
//
// WORKSPACE DOC (per epoch)
// Y.Map('schema') - Table/KV definitions (rarely changes)
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
// - Collaborative schema editing via Y.Map('schema')
// - Workspace identity (name/icon) shared across all epochs
//
// See specs/20260121T231500-doc-architecture-v2.md for details.
