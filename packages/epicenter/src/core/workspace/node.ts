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
 * │    createClient(def, opts)  →  WorkspaceClient { whenSynced, ... }  │
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
 * │    createClient(def, opts)  →  Promise<WorkspaceClient>             │
 * │         │                              │                            │
 * │         │                              └── whenSynced already resolved
 * │         │                                   (property omitted)      │
 * │         │                                                           │
 * │    Internally:                                                      │
 * │      const syncClient = createClientSync(def, opts);                │
 * │      await syncClient.whenSynced;                                   │
 * │      return { ...syncClient, whenSynced: undefined };               │
 * └─────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Implementation details
 *
 * The actual workspace creation logic lives in {@link ./workspace.ts | workspace.ts}:
 * - {@link defineWorkspace} - Creates a WorkspaceDefinition (pure normalization)
 * - {@link createClient} - Creates a runtime client (sync)
 * - {@link WorkspaceClient} - The full client type with `whenSynced`
 *
 * This module simply:
 * 1. Re-exports `defineWorkspace` (it's now pure, no wrapping needed)
 * 2. Wraps `createClient` to await `whenSynced` internally
 * 3. Returns the client without the `whenSynced` property
 *
 * @example Basic usage
 * ```typescript
 * import { defineWorkspace, createClient, id, text } from '@epicenter/hq/node';
 *
 * const definition = defineWorkspace({
 *   id: 'epicenter.blog',
 *   tables: {
 *     posts: { id: id(), title: text() },
 *   },
 *   kv: {},
 * });
 *
 * // Async - awaits initialization internally
 * const client = await createClient(definition, {
 *   extensions: { sqlite, persistence },
 * });
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
 *   const definition = defineWorkspace({ id: 'blog', tables: {...}, kv: {} });
 *
 *   const oldClient = await createClient(definition, { epoch: 1 });
 *   const newClient = await createClient(definition, { epoch: 2 });
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
	createClient as createClientSync,
	type WorkspaceClient as WorkspaceClientSync,
	type WorkspaceDefinition,
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
 * ├── name: string                       ├── name: string
 * ├── tables: Tables<T>                  ├── tables: Tables<T>
 * ├── kv: Kv<K>                          ├── kv: Kv<K>
 * ├── extensions: E                      ├── extensions: E
 * ├── ydoc: Y.Doc                        ├── ydoc: Y.Doc
 * ├── whenSynced: Promise<void>  ──────► (omitted - already resolved)
 * ├── destroy(): Promise<void>           ├── destroy(): Promise<void>
 * └── [Symbol.asyncDispose]              └── [Symbol.asyncDispose]
 * ```
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
 * Create a runtime client from a workspace definition (async, awaits internally).
 *
 * This is the Node.js version of `createClient` that awaits `whenSynced`
 * internally. When the Promise resolves, all extensions are fully
 * initialized and ready to use.
 *
 * ## Comparison to browser version
 *
 * | Import | Function | Returns |
 * |--------|----------|---------|
 * | `@epicenter/hq` | `createClient()` | `WorkspaceClient` (sync, has `whenSynced`) |
 * | `@epicenter/hq/node` | `createClient()` | `Promise<WorkspaceClient>` (no `whenSynced`) |
 *
 * ## What happens under the hood
 *
 * ```typescript
 * // This:
 * const client = await createClient(definition, { extensions });
 *
 * // Is equivalent to:
 * const syncClient = createClientSync(definition, { extensions });
 * await syncClient.whenSynced;
 * const { whenSynced: _, ...client } = syncClient;
 * ```
 *
 * @param definition - A WorkspaceDefinition from `defineWorkspace()` or loaded from JSON
 * @param options - Optional configuration
 * @param options.epoch - Workspace Doc version (defaults to 0). The Y.Doc GUID
 *   is `{workspaceId}-{epoch}`. Change this intentionally to create a
 *   separate document namespace (e.g., for migrations or sync isolation).
 * @param options.extensions - Factory functions that add features like
 *   persistence, sync, or SQL queries.
 *
 * @returns Promise resolving to a fully-initialized client (no `whenSynced`)
 *
 * @example Basic usage
 * ```typescript
 * const definition = defineWorkspace({ id: 'blog', tables: {...}, kv: {} });
 * const client = await createClient(definition, {
 *   extensions: { sqlite, persistence },
 * });
 * // Ready to use immediately
 * client.tables.posts.upsert({ id: '1', title: 'Hello' });
 * ```
 *
 * @example With epoch from Head Doc
 * ```typescript
 * import { createHeadDoc } from '@epicenter/hq';
 *
 * const head = createHeadDoc({ workspaceId: definition.id });
 * await head.whenSynced;
 * const epoch = head.getEpoch();
 *
 * const client = await createClient(definition, {
 *   epoch,
 *   extensions: { sqlite, persistence },
 * });
 * ```
 *
 * @example Cleanup with try/finally
 * ```typescript
 * const client = await createClient(definition, { extensions });
 * try {
 *   await runMigration(client);
 * } finally {
 *   await client.destroy();
 * }
 * ```
 *
 * @example Loading definition from JSON
 * ```typescript
 * const definition = JSON.parse(await readFile('workspace.json', 'utf-8'));
 * const client = await createClient(definition, { extensions });
 * ```
 *
 * @see {@link createClientSync} - The sync version (browser)
 * @see {@link ../extension.ts} - Extension factory documentation
 */
export async function createClient<
	TTableDefinitionMap extends TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap,
	TExtensionFactories extends ExtensionFactoryMap<
		TTableDefinitionMap,
		TKvDefinitionMap
	> = Record<string, never>,
>(
	definition: WorkspaceDefinition<TTableDefinitionMap, TKvDefinitionMap>,
	options: {
		epoch?: number;
		extensions?: TExtensionFactories;
	} = {},
): Promise<
	WorkspaceClient<
		TTableDefinitionMap,
		TKvDefinitionMap,
		InferExtensionExports<TExtensionFactories>
	>
> {
	// Call the sync createClient() from workspace.ts
	const client = createClientSync(definition, options);

	// Await whenSynced internally — this is the key difference from browser
	await client.whenSynced;

	// Return client without whenSynced property (it's already resolved)
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { whenSynced: _, ...clientWithoutWhenSynced } = client;

	return clientWithoutWhenSynced;
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
} from './workspace';
/**
 * Re-export defineWorkspace from workspace.ts.
 *
 * Since `defineWorkspace` now returns a pure `WorkspaceDefinition`
 * (no `.create()` method), no wrapping is needed for Node.js.
 */
export { defineWorkspace } from './workspace';
