/**
 * Node.js/CLI convenience wrapper for workspace creation.
 *
 * This module provides an **async** version of `createClient()` for environments
 * where the "sync construction + render gate" pattern isn't needed. Instead of
 * returning immediately with a `whenSynced` promise, the Node version awaits
 * initialization internally and returns a fully-ready client.
 *
 * ## When to use this vs the browser version
 *
 * | Environment | Import | `createClient()` returns | Use case |
 * |-------------|--------|-------------------------|----------|
 * | Browser/UI | `@epicenter/hq` | `WorkspaceClient` (sync) | Render gates, reactive UI |
 * | Node.js/CLI | `@epicenter/hq/node` | `Promise<WorkspaceClient>` | Scripts, servers, migrations |
 *
 * ## Architecture
 *
 * This is a thin wrapper around the sync version from {@link ./workspace.ts}:
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  @epicenter/hq (browser)                                            │
 * │                                                                     │
 * │    createClient(id, opts).withSchema(schema).withExtensions({})     │
 * │         │                              │                            │
 * │         │                              └── UI awaits client.whenSynced
 * │         │                                                           │
 * └─────────│───────────────────────────────────────────────────────────┘
 *           │
 *           │  (wraps)
 *           ▼
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  @epicenter/hq/node (this module)                                   │
 * │                                                                     │
 * │    createClient(id, opts).withSchema(schema).withExtensions({})     │
 * │         │                              │                            │
 * │         │                              └── Promise<WorkspaceClient>
 * │         │                                   whenSynced already resolved
 * │         │                                   (property omitted)      │
 * │         │                                                           │
 * │    Internally:                                                      │
 * │      const syncClient = createClientSync(...).withExtensions({});   │
 * │      await syncClient.whenSynced;                                   │
 * │      return { ...syncClient, whenSynced: undefined };               │
 * └─────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Implementation details
 *
 * The actual workspace creation logic lives in {@link ./workspace.ts | workspace.ts}:
 * - {@link defineWorkspace} - Creates a WorkspaceSchema (pure normalization)
 * - {@link createClient} - Creates a runtime client builder (sync)
 * - {@link WorkspaceClient} - The full client type with `whenSynced`
 *
 * This module simply:
 * 1. Re-exports `defineWorkspace` (it's now pure, no wrapping needed)
 * 2. Wraps `createClient` so `.withExtensions()` returns a Promise
 * 3. Returns the client without the `whenSynced` property
 *
 * @example Basic usage
 * ```typescript
 * import { defineWorkspace, createClient, id, text, table } from '@epicenter/hq/node';
 *
 * const schema = defineWorkspace({
 *   id: 'epicenter.blog',
 *   tables: {
 *     posts: table({ name: 'Posts', fields: { id: id(), title: text() } }),
 *   },
 *   kv: {},
 * });
 *
 * // Async - awaits initialization internally
 * const client = await createClient(schema.id, { epoch: 0 })
 *   .withSchema(schema)
 *   .withExtensions({ persistence });
 *
 * // Ready to use immediately
 * client.tables.posts.upsert({ id: '1', title: 'Hello' });
 * await client.destroy();
 * ```
 *
 * @example Migration script
 * ```typescript
 * import { defineWorkspace, createClient } from '@epicenter/hq/node';
 *
 * async function migrate() {
 *   const schema = defineWorkspace({ id: 'blog', tables: {...}, kv: {} });
 *
 *   const oldClient = await createClient(schema.id, { epoch: 1 })
 *     .withSchema(schema)
 *     .withExtensions({});
 *   const newClient = await createClient(schema.id, { epoch: 2 })
 *     .withSchema(schema)
 *     .withExtensions({});
 *
 *   for (const post of oldClient.tables.posts.getAllValid()) {
 *     newClient.tables.posts.upsert(migratePost(post));
 *   }
 *
 *   await oldClient.destroy();
 *   await newClient.destroy();
 * }
 * ```
 *
 * @see {@link ./workspace.ts} - The sync implementation that powers this wrapper
 * @see {@link ../lifecycle.ts} - The Lifecycle protocol (`whenSynced`, `destroy`)
 * @see {@link ../extension.ts} - Extension factory types
 *
 * @module
 */

import type { ExtensionFactoryMap, InferExtensionExports } from '../extension';
import type { Lifecycle } from '../lifecycle';
import type { KvDefinitionMap, TableDefinitionMap } from '../schema';
import {
	type ClientBuilder as ClientBuilderSync,
	createClient as createClientSync,
	type WorkspaceClient as WorkspaceClientSync,
	type WorkspaceSchema,
} from './workspace';

/**
 * Workspace client type for Node.js environments.
 *
 * This type is derived from the browser {@link WorkspaceClientSync | WorkspaceClient}
 * with the `whenSynced` property omitted. Since the Node.js `createClient()` function
 * awaits initialization internally, `whenSynced` has already resolved by the
 * time you receive the client.
 *
 * ## Relationship to browser client
 *
 * ```
 * WorkspaceClient (browser)              WorkspaceClient (node)
 * ├── id: string                         ├── id: string
 * ├── tables: Tables<T>                  ├── tables: Tables<T>
 * ├── kv: Kv<K>                          ├── kv: Kv<K>
 * ├── extensions: E                      ├── extensions: E
 * ├── ydoc: Y.Doc                        ├── ydoc: Y.Doc
 * ├── whenSynced: Promise<void>  ──────► (omitted - already resolved)
 * ├── destroy(): Promise<void>           ├── destroy(): Promise<void>
 * └── [Symbol.asyncDispose]              └── [Symbol.asyncDispose]
 * ```
 *
 * Note: Workspace identity (name, icon, description) comes from HeadDoc.getMeta(),
 * not from the client.
 *
 * ## Why omit `whenSynced`?
 *
 * In browser/UI contexts, `whenSynced` enables the render gate pattern:
 *
 * ```svelte
 * {#await client.whenSynced}
 *   <Loading />
 * {:then}
 *   <App />
 * {/await}
 * ```
 *
 * In Node.js scripts, this pattern isn't useful. You just want to `await`
 * creation and start working. So we await internally and remove the property
 * to signal "this client is ready."
 *
 * @see {@link WorkspaceClientSync} - The browser version with `whenSynced`
 * @see {@link ./workspace.ts} - Where `WorkspaceClientSync` is defined
 */
export type WorkspaceClient<
	TTableDefinitionMap extends TableDefinitionMap = TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap = KvDefinitionMap,
	TExtensionExports extends Record<string, Lifecycle> = Record<
		string,
		Lifecycle
	>,
> = Omit<
	WorkspaceClientSync<TTableDefinitionMap, TKvDefinitionMap, TExtensionExports>,
	'whenSynced'
>;

/**
 * Async builder for creating workspace clients in Node.js.
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
 *      .withSchema(schema)               .withExtensions({})
 *               │                               │
 *               │                               │
 *               ▼                               ▼
 *      .withExtensions({})          Promise<WorkspaceClient>
 *               │                        (dynamic schema)
 *               │
 *               ▼
 *     Promise<WorkspaceClient>
 *        (static schema)
 * ```
 *
 * ## Why async methods?
 *
 * The `.withExtensions()` method returns a Promise that awaits `whenSynced` internally.
 * This matches the Node.js philosophy of awaiting initialization before returning.
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
	 * @example
	 * ```typescript
	 * const schema = defineWorkspace({ id: 'blog', tables: {...}, kv: {} });
	 *
	 * const client = await createClient(schema.id, { epoch })
	 *   .withSchema(schema)
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
	 * Attach extensions and create the client.
	 *
	 * This is the terminal operation that creates the actual WorkspaceClient.
	 * The returned Promise resolves after all extensions have completed their `whenSynced`.
	 *
	 * Pass an empty object `{}` if you don't need any extensions.
	 *
	 * @example
	 * ```typescript
	 * // With extensions
	 * const schema = defineWorkspace({ id: 'blog', tables: {...}, kv: {} });
	 *
	 * const client = await createClient(schema.id, { epoch })
	 *   .withSchema(schema)
	 *   .withExtensions({
	 *     persistence: (ctx) => persistence(ctx, { filePath }),
	 *     sqlite: (ctx) => sqlite(ctx, { dbPath }),
	 *   });
	 *
	 * client.tables.recordings.upsert({ ... });
	 *
	 * // Without extensions
	 * const client = await createClient(schema.id, { epoch })
	 *   .withSchema(schema)
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
	): Promise<
		WorkspaceClient<
			TTableDefinitionMap,
			TKvDefinitionMap,
			InferExtensionExports<TExtensionFactories>
		>
	>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API: createClient with Builder Pattern (Node.js async version)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create an async client builder for a workspace.
 *
 * Returns a {@link ClientBuilder} for chaining `.withSchema()` and `.withExtensions()`.
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
 *      .withSchema(schema)               .withExtensions({})
 *               │                               │
 *               │                               │
 *               ▼                               ▼
 *      .withExtensions({})          Promise<WorkspaceClient>
 *               │                        (dynamic schema)
 *               │
 *               ▼
 *     Promise<WorkspaceClient>
 *        (static schema)
 * ```
 *
 * ## Path 1: Static Schema (Code-Defined)
 *
 * For apps like Whispering where schema is defined in code:
 *
 * ```typescript
 * const schema = defineWorkspace({
 *   id: 'epicenter.whispering',
 *   tables: { recordings: table({ name: 'Recordings', fields: { id: id(), title: text() } }) },
 *   kv: {},
 * });
 *
 * const client = await createClient(schema.id, { epoch })
 *   .withSchema(schema)
 *   .withExtensions({
 *     persistence: (ctx) => persistence(ctx, { filePath }),
 *   });
 *
 * // Ready to use immediately (no whenSynced needed)
 * client.tables.recordings.upsert({ ... });
 * ```
 *
 * ## Path 2: Dynamic Schema (Y.Doc-Defined)
 *
 * For the Epicenter app where schema lives in the Y.Doc:
 *
 * ```typescript
 * const client = await createClient('my-workspace', { epoch: 2 })
 *   .withExtensions({
 *     persistence: (ctx) => persistence(ctx, { filePath }),
 *   });
 * ```
 *
 * ## Without Extensions
 *
 * Pass an empty object to `.withExtensions()`:
 *
 * ```typescript
 * const client = await createClient(schema.id, { epoch })
 *   .withSchema(schema)
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
	// Get the sync builder from workspace.ts
	const syncBuilder = createClientSync(workspaceId, { epoch: options.epoch });

	// Return async builder that wraps the sync builder
	return createAsyncClientBuilder(syncBuilder);
}

/**
 * Internal: Create an async ClientBuilder that wraps a sync ClientBuilder.
 */
function createAsyncClientBuilder<
	TTableDefinitionMap extends TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap,
>(
	syncBuilder: ClientBuilderSync<TTableDefinitionMap, TKvDefinitionMap>,
): ClientBuilder<TTableDefinitionMap, TKvDefinitionMap> {
	return {
		withSchema<
			TSchemaTables extends TableDefinitionMap,
			TSchemaKv extends KvDefinitionMap,
		>(
			schema: WorkspaceSchema<TSchemaTables, TSchemaKv>,
		): ClientBuilder<TSchemaTables, TSchemaKv> {
			const newSyncBuilder = syncBuilder.withSchema(schema);
			return createAsyncClientBuilder(newSyncBuilder);
		},

		async withExtensions<
			TExtFact extends ExtensionFactoryMap<
				TTableDefinitionMap,
				TKvDefinitionMap
			>,
		>(
			extensions: TExtFact,
		): Promise<
			WorkspaceClient<
				TTableDefinitionMap,
				TKvDefinitionMap,
				InferExtensionExports<TExtFact>
			>
		> {
			const syncClient = syncBuilder.withExtensions(extensions);
			await syncClient.whenSynced;
			const { whenSynced: _, ...clientWithoutWhenSynced } = syncClient;
			return clientWithoutWhenSynced;
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-exports
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Re-export schema field factories for defining workspace tables.
 *
 * These are the building blocks for table definitions:
 *
 * ```typescript
 * import { defineWorkspace, createClient, id, text, boolean, date } from '@epicenter/hq/node';
 *
 * const definition = defineWorkspace({
 *   id: 'epicenter.blog',
 *   tables: {
 *     posts: {
 *       id: id(),           // Primary key (always required)
 *       title: text(),      // NOT NULL text
 *       published: boolean({ default: false }),
 *       createdAt: date(),  // Temporal-aware date with timezone
 *     },
 *   },
 *   kv: {},
 * });
 *
 * const client = await createClient(definition);
 * ```
 *
 * @see {@link ../schema/fields/factories.ts} - Field factory implementations
 * @see {@link ../schema/fields/types.ts} - Field type definitions
 */
export {
	// Field factories for table definitions
	boolean,
	// Table metadata helpers
	cover,
	date,
	// ID generation utilities
	generateGuid,
	generateId,
	icon,
	id,
	integer,
	json,
	real,
	richtext,
	select,
	table,
	tags,
	text,
} from '../schema';

/**
 * Re-export types from workspace.ts for consumers of the Node entrypoint.
 *
 * @see {@link ./workspace.ts} - Where these types are defined
 */
export type {
	NormalizedKv,
	WorkspaceDefinition,
	WorkspaceInput,
	WorkspaceSchema,
} from './workspace';
/**
 * Re-export defineWorkspace from workspace.ts.
 *
 * Since `defineWorkspace` now returns a pure `WorkspaceDefinition`
 * (no `.create()` method), no wrapping is needed for Node.js.
 */
export { defineWorkspace } from './workspace';
