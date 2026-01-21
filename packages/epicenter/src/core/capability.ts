/**
 * Capability types and utilities.
 *
 * Single source of truth for the capability protocol. Works across Node.js and browser.
 * Capabilities receive filesystem paths via their config, not through context.
 */

import type * as Y from 'yjs';
import type { Kv } from './kv/core';
import { defineExports, type Lifecycle } from './lifecycle';
import type { KvDefinitionMap, TableDefinitionMap } from './schema';
import type { Tables } from './tables/create-tables';

// Re-export lifecycle utilities for capability authors
export { defineExports, type Lifecycle } from './lifecycle';

/**
 * Context provided to each capability function.
 *
 * A capability is a function that attaches behavior to a workspace.
 * The context gives access to the workspace's core primitives, and
 * the capability decides what to use based on its purpose.
 *
 * ## Common Patterns
 *
 * ### 1. Persist the entire YDoc (storage capability)
 * ```typescript
 * const persistence: CapabilityFactory = ({ ydoc }, config) => {
 *   const saved = loadFromDisk(config.path);
 *   Y.applyUpdate(ydoc, saved);
 *   ydoc.on('update', () => {
 *     saveToDisk(config.path, Y.encodeStateAsUpdate(ydoc));
 *   });
 *   return defineExports();
 * };
 * ```
 *
 * ### 2. Sync tables to external store (materializer capability)
 * ```typescript
 * const sqlite: CapabilityFactory = ({ tables }, config) => {
 *   const db = new Database(config.dbPath);
 *   for (const table of tables.$all()) {
 *     table.observeChanges((changes) => {
 *       for (const [id, change] of changes) {
 *         if (change.action === 'add' && change.result.status === 'valid') {
 *           db.insert(table.name, change.result.row);
 *         } else if (change.action === 'update' && change.result.status === 'valid') {
 *           db.update(table.name, change.result.row);
 *         } else if (change.action === 'delete') {
 *           db.delete(table.name, id);
 *         }
 *       }
 *     });
 *   }
 *   return defineExports({ db, destroy: () => db.close() });
 * };
 * ```
 *
 * ### 3. Real-time sync (sync capability)
 * ```typescript
 * const websocketSync: CapabilityFactory = ({ ydoc }) => {
 *   const ws = new WebsocketProvider(url, ydoc.guid, ydoc);
 *   return defineExports({
 *     whenSynced: new Promise(r => ws.on('sync', r)),
 *     destroy: () => ws.destroy(),
 *   });
 * };
 * ```
 *
 * ### 4. Do nothing with data (pure side-effect capability)
 * ```typescript
 * const logger: CapabilityFactory = ({ id }) => {
 *   console.log(`Workspace ${id} initialized`);
 *   return defineExports();
 * };
 * ```
 *
 * ## What Capabilities Can Return
 *
 * Capability factories are **always synchronous**. Async initialization is tracked
 * via the returned `whenSynced` promise, not the factory itself.
 *
 * Use `defineExports()` or `defineCapabilities()` to wrap your return for explicit
 * type safety. The framework fills in defaults for missing lifecycle fields:
 * - `whenSynced`: defaults to `Promise.resolve()`
 * - `destroy`: defaults to no-op `() => {}`
 *
 * Any additional properties become accessible via `client.capabilities.{name}`.
 *
 * ## Environment Detection
 *
 * Capabilities that need filesystem paths should accept them via their config parameter.
 * Use `typeof process !== 'undefined'` to detect Node.js/Bun vs browser environments.
 */
export type CapabilityContext<
	TTableDefinitionMap extends TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap,
> = {
	/**
	 * Human-readable workspace identifier for URLs, paths, and sync.
	 * Format: lowercase alphanumeric with dots and hyphens (e.g., "my-notes", "epicenter.whispering").
	 */
	id: string;

	/**
	 * This capability's key from `.create({ capabilities: { key: ... } })`.
	 * Useful for namespacing storage paths or logging.
	 */
	capabilityId: string;

	/**
	 * The underlying YJS document.
	 * Use for doc-level operations: persistence, sync, undo/redo.
	 */
	ydoc: Y.Doc;

	/**
	 * Typed table helpers.
	 * Use `tables.$all()` to iterate over all tables, or access specific tables
	 * like `tables.posts.observeChanges()` for reactive updates.
	 */
	tables: Tables<TTableDefinitionMap>;

	/**
	 * Typed KV helpers.
	 * Use for simple key-value storage within the workspace.
	 */
	kv: Kv<TKvDefinitionMap>;
};

/**
 * Capability exports - returned values accessible via `client.capabilities.{name}`.
 *
 * This type combines the lifecycle protocol with custom exports.
 * The framework guarantees `whenSynced` and `destroy` exist on all capabilities.
 *
 * @typeParam T - Additional exports beyond lifecycle fields
 *
 * @example
 * ```typescript
 * // Type for a capability that exports a database
 * type SqliteCapabilityExports = CapabilityExports<{ db: Database }>;
 * // → { whenSynced, destroy, db }
 *
 * // Type for a capability with no custom exports
 * type SimpleCapabilityExports = CapabilityExports;
 * // → { whenSynced, destroy }
 * ```
 */
export type CapabilityExports<T extends Record<string, unknown> = {}> =
	Lifecycle & T;

/**
 * A capability factory function that attaches functionality to a workspace.
 *
 * Factories are **always synchronous**. Async initialization is tracked via
 * the returned `whenSynced` promise, not the factory itself.
 *
 * Use `defineExports()` or `defineCapabilities()` to wrap your return for
 * explicit type safety. The framework fills in defaults for missing fields:
 * - `whenSynced`: defaults to `Promise.resolve()`
 * - `destroy`: defaults to no-op `() => {}`
 *
 * @example
 * ```typescript
 * const persistence: CapabilityFactory = ({ ydoc }) => {
 *   const provider = new IndexeddbPersistence(ydoc.guid, ydoc);
 *   return defineExports({
 *     whenSynced: provider.whenSynced,
 *     destroy: () => provider.destroy(),
 *   });
 * };
 * ```
 */
export type CapabilityFactory<
	TTableDefinitionMap extends TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap,
	TExports extends CapabilityExports = CapabilityExports,
> = (
	context: CapabilityContext<TTableDefinitionMap, TKvDefinitionMap>,
) => TExports;

/**
 * A map of capability factory functions keyed by capability ID.
 *
 * Capability factories add functionality to workspaces: persistence, sync, SQL queries, etc.
 * Each factory receives context and optionally returns exports accessible via
 * `client.capabilities[capabilityId]`.
 */
export type CapabilityFactoryMap<
	TTableDefinitionMap extends TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap,
> = Record<string, CapabilityFactory<TTableDefinitionMap, TKvDefinitionMap>>;

/**
 * Utility type to infer exports from a capability factory map.
 *
 * Maps each capability key to its return type. Factories are always synchronous,
 * so no Promise unwrapping is needed.
 */
export type InferCapabilityExports<TCapabilityFactories> = {
	[K in keyof TCapabilityFactories]: TCapabilityFactories[K] extends CapabilityFactory<
		TableDefinitionMap,
		KvDefinitionMap,
		infer TExports
	>
		? TExports extends CapabilityExports
			? TExports
			: CapabilityExports
		: CapabilityExports;
};

/**
 * Helper to define capability exports with proper typing and lifecycle normalization.
 *
 * Automatically fills in missing `whenSynced` and `destroy` fields with defaults.
 * Use this at the return site of your capability factory for explicit type safety.
 *
 * This is an alias for `defineExports()` for consistency with `defineProviders()`.
 * Both can be used interchangeably; choose whichever reads better in your context.
 *
 * @example Simple capability (no custom exports)
 * ```typescript
 * const logger: CapabilityFactory = ({ id }) => {
 *   console.log(`Workspace ${id} initialized`);
 *   return defineCapabilities();
 * };
 * ```
 *
 * @example Capability with exports
 * ```typescript
 * const sqlite: CapabilityFactory = ({ ydoc }) => {
 *   const db = new Database(':memory:');
 *   return defineCapabilities({
 *     db,
 *     destroy: () => db.close(),
 *   });
 * };
 * ```
 *
 * @example Full lifecycle
 * ```typescript
 * const sync: CapabilityFactory = ({ ydoc }) => {
 *   const provider = new WebsocketProvider(url, ydoc.guid, ydoc);
 *   return defineCapabilities({
 *     provider,
 *     whenSynced: new Promise(r => provider.on('sync', r)),
 *     destroy: () => provider.destroy(),
 *   });
 * };
 * ```
 */
export function defineCapabilities<T extends Record<string, unknown>>(
	exports: T,
): CapabilityExports<T> {
	return defineExports(exports);
}
