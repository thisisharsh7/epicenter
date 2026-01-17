/**
 * Node.js/CLI convenience wrapper for workspace creation.
 *
 * This module provides an **async** version of `defineWorkspace()` for environments
 * where the "sync construction + render gate" pattern isn't needed. Instead of
 * returning immediately with a `whenSynced` promise, the Node version awaits
 * initialization internally and returns a fully-ready client.
 *
 * ## When to use this vs the browser version
 *
 * | Environment | Import | `create()` returns | Use case |
 * |-------------|--------|-------------------|----------|
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
 * │    workspace.create()  →  WorkspaceClient { whenSynced, ... }       │
 * │         │                        │                                  │
 * │         │                        └── UI awaits client.whenSynced    │
 * │         │                                                           │
 * └─────────│───────────────────────────────────────────────────────────┘
 *           │
 *           │  (wraps)
 *           ▼
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  @epicenter/hq/node (this module)                                   │
 * │                                                                     │
 * │    workspace.create()  →  Promise<WorkspaceClient>                  │
 * │         │                        │                                  │
 * │         │                        └── whenSynced already resolved    │
 * │         │                             (property omitted)            │
 * │         │                                                           │
 * │    Internally:                                                      │
 * │      const syncClient = syncWorkspace.create();                     │
 * │      await syncClient.whenSynced;                                   │
 * │      return { ...syncClient, whenSynced: undefined };               │
 * └─────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Implementation details
 *
 * The actual workspace creation logic lives in {@link ./workspace.ts | workspace.ts}:
 * - {@link defineWorkspace} - The sync factory that creates workspace definitions
 * - {@link WorkspaceClient} - The full client type with `whenSynced`
 * - {@link Lifecycle} - The protocol defining `whenSynced` and `destroy`
 *
 * This module simply:
 * 1. Calls the sync `defineWorkspace()` from workspace.ts
 * 2. Wraps `.create()` to await `whenSynced` internally
 * 3. Returns the client without the `whenSynced` property
 *
 * @example Basic usage
 * ```typescript
 * import { defineWorkspace, id, text } from '@epicenter/hq/node';
 *
 * const workspace = defineWorkspace({
 *   id: 'epicenter.blog',
 *   name: 'Blog',
 *   tables: { posts: { fields: { id: id(), title: text() } } },
 *   kv: {},
 * });
 *
 * // Async - awaits initialization internally
 * const client = await workspace.create({
 *   capabilities: { sqlite, persistence },
 * });
 *
 * // Ready to use immediately
 * client.tables.posts.upsert({ id: '1', title: 'Hello' });
 * await client.destroy();
 * ```
 *
 * @example Migration script
 * ```typescript
 * import { defineWorkspace } from '@epicenter/hq/node';
 *
 * async function migrate() {
 *   const oldClient = await workspace.create({ epoch: 1 });
 *   const newClient = await workspace.create({ epoch: 2 });
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
 * @see {@link ../capability.ts} - Capability factory types and `defineCapabilities`
 *
 * @module
 */

import type {
	CapabilityFactoryMap,
	InferCapabilityExports,
} from '../capability';
import type { Lifecycle } from '../lifecycle';
import type { KvDefinitionMap, TableDefinitionMap } from '../schema';
import {
	defineWorkspace as defineWorkspaceSync,
	type WorkspaceClient as WorkspaceClientSync,
	type WorkspaceDefinition,
	type Workspace as WorkspaceSync,
} from './workspace';

/**
 * Workspace client type for Node.js environments.
 *
 * This type is derived from the browser {@link WorkspaceClientSync | WorkspaceClient}
 * with the `whenSynced` property omitted. Since the Node.js `create()` method
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
 * ├── capabilities: C                    ├── capabilities: C
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
	TCapabilityExports extends Record<string, Lifecycle> = Record<
		string,
		Lifecycle
	>,
> = Omit<
	WorkspaceClientSync<
		TTableDefinitionMap,
		TKvDefinitionMap,
		TCapabilityExports
	>,
	'whenSynced'
>;

/**
 * Workspace type for Node.js with async `create()` method.
 *
 * This type extends the browser {@link WorkspaceSync | Workspace} but overrides
 * the `create()` method to return a `Promise` instead of returning synchronously.
 * This makes it natural to use in async/await Node.js code.
 *
 * ## Type derivation
 *
 * We derive from the sync `Workspace` to ensure schema properties (`id`,
 * `name`, `tables`, `kv`) stay in sync. Only `create()` is overridden:
 *
 * ```typescript
 * // Browser (sync construction)
 * Workspace.create() → WorkspaceClient { whenSynced: Promise<void>, ... }
 *
 * // Node (async construction)
 * Workspace.create() → Promise<WorkspaceClient { /* no whenSynced *\/ }>
 * ```
 *
 * ## Why not just use the browser version?
 *
 * You *can* use the browser version in Node.js:
 *
 * ```typescript
 * import { defineWorkspace } from '@epicenter/hq';
 * const client = workspace.create({ capabilities });
 * await client.whenSynced;
 * ```
 *
 * But this requires you to remember the two-step dance. The Node version
 * provides a simpler mental model for scripts and servers:
 *
 * ```typescript
 * import { defineWorkspace } from '@epicenter/hq/node';
 * const client = await workspace.create({ capabilities });
 * // Done. Ready to use.
 * ```
 *
 * @see {@link WorkspaceSync} - The browser version with sync `create()`
 * @see {@link ./workspace.ts} - Where `WorkspaceSync` and `defineWorkspace` live
 */
export type Workspace<
	TTableDefinitionMap extends TableDefinitionMap = TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap = KvDefinitionMap,
> = Omit<WorkspaceSync<TTableDefinitionMap, TKvDefinitionMap>, 'create'> & {
	/**
	 * Create a workspace client asynchronously.
	 *
	 * This method wraps the sync {@link WorkspaceSync.create | browser create()}
	 * and awaits `whenSynced` internally. When the Promise resolves, all
	 * capabilities are fully initialized and ready to use.
	 *
	 * ## What happens under the hood
	 *
	 * ```typescript
	 * // This:
	 * const client = await workspace.create({ capabilities });
	 *
	 * // Is equivalent to:
	 * const syncClient = syncWorkspace.create({ capabilities });
	 * await syncClient.whenSynced;
	 * const { whenSynced: _, ...client } = syncClient;
	 * ```
	 *
	 * ## Options
	 *
	 * @param options.epoch - Workspace Doc version (defaults to 0). Creates
	 *   a Y.Doc with GUID `{workspaceId}-{epoch}`. Change this intentionally
	 *   to create separate document namespaces (migrations, sync isolation).
	 *   See {@link ./workspace.ts | workspace.ts} for epoch semantics.
	 *
	 * @param options.capabilities - Factory functions that add features like
	 *   persistence, sync, or SQL queries. Each factory receives context and
	 *   returns exports accessible via `client.capabilities.{name}`.
	 *   See {@link ../capability.ts | capability.ts} for factory types.
	 *
	 * @returns Promise resolving to a fully-initialized client (no `whenSynced`)
	 *
	 * @example Basic usage
	 * ```typescript
	 * const client = await workspace.create({
	 *   capabilities: { sqlite, persistence },
	 * });
	 * // Ready to use immediately
	 * client.tables.posts.upsert({ id: '1', title: 'Hello' });
	 * ```
	 *
	 * @example With epoch from Head Doc
	 * ```typescript
	 * import { createHeadDoc } from '@epicenter/hq';
	 *
	 * const head = createHeadDoc({ workspaceId: workspace.id });
	 * await head.whenSynced;
	 * const epoch = head.getEpoch();
	 *
	 * const client = await workspace.create({
	 *   epoch,
	 *   capabilities: { sqlite, persistence },
	 * });
	 * ```
	 *
	 * @example Cleanup with try/finally
	 * ```typescript
	 * const client = await workspace.create({ capabilities });
	 * try {
	 *   await runMigration(client);
	 * } finally {
	 *   await client.destroy();
	 * }
	 * ```
	 *
	 * @see {@link WorkspaceSync.create} - The sync version (browser)
	 * @see {@link ../capability.ts} - Capability factory documentation
	 */
	create<
		TCapabilityFactories extends CapabilityFactoryMap<
			TTableDefinitionMap,
			TKvDefinitionMap
		> = {},
	>(options?: {
		epoch?: number;
		capabilities?: TCapabilityFactories;
	}): Promise<
		WorkspaceClient<
			TTableDefinitionMap,
			TKvDefinitionMap,
			InferCapabilityExports<TCapabilityFactories>
		>
	>;
};

/**
 * Define a workspace with async `create()` for Node.js/CLI usage.
 *
 * This factory wraps the browser {@link defineWorkspaceSync | defineWorkspace()}
 * from {@link ./workspace.ts | workspace.ts}, providing a more ergonomic API for
 * non-UI environments. The only difference is how `create()` behaves:
 *
 * | Version | `create()` returns | `whenSynced` |
 * |---------|-------------------|--------------|
 * | Browser | `WorkspaceClient` (sync) | Property on client |
 * | Node | `Promise<WorkspaceClient>` | Awaited internally |
 *
 * ## How it works
 *
 * The implementation is simple — we delegate to the sync version and add an
 * async wrapper:
 *
 * ```typescript
 * // Simplified implementation
 * function defineWorkspace(config) {
 *   const syncWorkspace = defineWorkspaceSync(config);
 *   return {
 *     ...config,
 *     async create(options) {
 *       const client = syncWorkspace.create(options);
 *       await client.whenSynced;
 *       return omit(client, 'whenSynced');
 *     },
 *   };
 * }
 * ```
 *
 * All the real work (Y.Doc creation, schema merging, capability initialization)
 * happens in {@link defineWorkspaceSync | the sync version}.
 *
 * ## When to use this vs the browser version
 *
 * **Use this (Node version) for:**
 * - CLI scripts
 * - Migration scripts
 * - Server-side code
 * - Tests
 * - Any async/await context without UI render gates
 *
 * **Use the browser version for:**
 * - Svelte/React/Vue apps with render gates
 * - Code that needs to show loading state during initialization
 * - Module-level exports where you can't use top-level await
 *
 * @param config - Workspace configuration. Same as browser version.
 * @param config.id - Human-readable identifier for URLs, paths, and sync.
 *   Format: lowercase alphanumeric with dots and hyphens (e.g., "my-notes", "epicenter.whispering").
 * @param config.name - Display name shown in UI.
 * @param config.tables - Table definitions with fields, icons, covers.
 *   See {@link ../schema/fields/types.ts | field types} for available field factories.
 * @param config.kv - Key-value store definitions.
 *
 * @returns A workspace with async `create()` method
 *
 * @example Basic usage
 * ```typescript
 * import { defineWorkspace, id, text } from '@epicenter/hq/node';
 *
 * const workspace = defineWorkspace({
 *   id: 'epicenter.blog',
 *   name: 'Blog',
 *   tables: {
 *     posts: {
 *       name: 'Posts',
 *       icon: { type: 'emoji', value: '📝' },
 *       cover: null,
 *       description: 'Blog posts',
 *       fields: { id: id(), title: text() },
 *     },
 *   },
 *   kv: {},
 * });
 *
 * // Async - awaits initialization internally
 * const client = await workspace.create({
 *   capabilities: { sqlite, persistence },
 * });
 *
 * // Ready to use
 * client.tables.posts.upsert({ id: '1', title: 'Hello' });
 * await client.destroy();
 * ```
 *
 * @example Server with multiple workspaces
 * ```typescript
 * const blogClient = await blogWorkspace.create({ capabilities });
 * const authClient = await authWorkspace.create({ capabilities });
 *
 * const server = createServer([blogClient, authClient], { port: 3913 });
 * server.start();
 * ```
 *
 * @example Migration between epochs
 * ```typescript
 * const oldClient = await workspace.create({ epoch: 1, capabilities });
 * const newClient = await workspace.create({ epoch: 2, capabilities });
 *
 * for (const row of oldClient.tables.posts.getAllValid()) {
 *   newClient.tables.posts.upsert(migrateRow(row));
 * }
 *
 * await Promise.all([oldClient.destroy(), newClient.destroy()]);
 * ```
 *
 * @see {@link defineWorkspaceSync} - The sync browser version (in workspace.ts)
 * @see {@link ./workspace.ts} - Full implementation details
 * @see {@link ../lifecycle.ts} - Lifecycle protocol (`whenSynced`, `destroy`)
 * @see {@link ../capability.ts} - Capability factory types
 */
export function defineWorkspace<
	TTableDefinitionMap extends TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap = Record<string, never>,
>(
	config: WorkspaceDefinition<TTableDefinitionMap, TKvDefinitionMap>,
): Workspace<TTableDefinitionMap, TKvDefinitionMap> {
	// Delegate to the sync factory from workspace.ts
	const syncWorkspace = defineWorkspaceSync(config);

	return {
		// Spread config to include id, name, tables, kv
		...config,

		/**
		 * Create a workspace client asynchronously.
		 *
		 * Delegates to {@link WorkspaceSync.create | sync create()} and awaits
		 * `whenSynced` before returning. The returned client has no `whenSynced`
		 * property since initialization is already complete.
		 *
		 * @see {@link Workspace.create} for full documentation
		 */
		async create<
			TCapabilityFactories extends CapabilityFactoryMap<
				TTableDefinitionMap,
				TKvDefinitionMap
			> = {},
		>(
			options: { epoch?: number; capabilities?: TCapabilityFactories } = {},
		): Promise<
			WorkspaceClient<
				TTableDefinitionMap,
				TKvDefinitionMap,
				InferCapabilityExports<TCapabilityFactories>
			>
		> {
			// Call the sync create() from workspace.ts
			const client = syncWorkspace.create(options);

			// Await whenSynced internally — this is the key difference from browser
			await client.whenSynced;

			// Return client without whenSynced property (it's already resolved)
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			const { whenSynced: _, ...clientWithoutWhenSynced } = client;

			return clientWithoutWhenSynced;
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-exports for convenience
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Re-export schema field factories for defining workspace tables.
 *
 * These are the building blocks for table definitions:
 *
 * ```typescript
 * import { defineWorkspace, id, text, boolean, date } from '@epicenter/hq/node';
 *
 * const workspace = defineWorkspace({
 *   tables: {
 *     posts: {
 *       fields: {
 *         id: id(),           // Primary key (always required)
 *         title: text(),      // NOT NULL text
 *         published: boolean({ default: false }),
 *         createdAt: date(),  // Temporal-aware date with timezone
 *       },
 *     },
 *   },
 * });
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
export type { WorkspaceDefinition } from './workspace';
