/**
 * Capability types and utilities.
 *
 * Single source of truth for the capability protocol. Works across Node.js and browser.
 * Capabilities receive filesystem paths via their config, not through context.
 */

import type * as Y from 'yjs';
import type { Tables } from './tables/create-tables';
import type { Kv } from './kv/core';
import type { KvDefinitionMap, TableDefinitionMap } from './schema';
import { defineExports, type Lifecycle, type MaybePromise } from './lifecycle';

// Re-export lifecycle utilities for capability authors
export { defineExports, type Lifecycle, type MaybePromise } from './lifecycle';

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
 *   return defineExports({ destroy: () => ws.destroy() });
 * };
 * ```
 *
 * ### 4. Do nothing with data (pure side-effect capability)
 * ```typescript
 * const logger: CapabilityFactory = ({ id }) => {
 *   console.log(`Workspace ${id} initialized`);
 * };
 * ```
 *
 * ## What Capabilities Can Return
 *
 * Capabilities can return any of:
 * - **void** - Framework provides default lifecycle
 * - **Plain object** - Framework adds `whenSynced` and `destroy` defaults
 * - **Object with lifecycle** - Via `defineExports()` for explicit control
 *
 * The optional lifecycle fields:
 * - `whenSynced?: Promise<unknown>` - Resolves when initialization complete (default: resolved)
 * - `destroy?: () => MaybePromise<void>` - Cleanup function (default: no-op)
 *
 * Any additional properties become accessible via `client.capabilities.{name}`.
 * The framework always normalizes returns to include both lifecycle fields.
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
	/** Globally unique identifier for sync coordination. */
	id: string;

	/** Human-readable slug for URLs, paths, logs, and CLI commands (e.g., 'blog', 'notes'). */
	slug: string;

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
 * Capability factories receive context and return exports (or void).
 * The exports become accessible via `client.capabilities.{name}`.
 *
 * The framework normalizes all returns, so you can:
 * - Return void (for pure side-effect capabilities)
 * - Return a plain object (framework adds lifecycle defaults)
 * - Return via `defineExports()` (explicit lifecycle)
 */
export type CapabilityFactory<
	TTableDefinitionMap extends TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap,
	TExports extends CapabilityExports = CapabilityExports,
> = (
	context: CapabilityContext<TTableDefinitionMap, TKvDefinitionMap>,
) => MaybePromise<TExports | void>;

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
 * Maps each capability key to its return type (unwrapped from Promise if async).
 * Factories returning `void` get base `CapabilityExports` (just lifecycle fields).
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
 * Use this at the return site of your capability factory for explicit lifecycle.
 *
 * For simple capabilities, you can return void or a plain object instead;
 * the framework normalizes at the boundary anyway.
 *
 * @example Simple capability (no exports)
 * ```typescript
 * const logger: CapabilityFactory = ({ id }) => {
 *   console.log(`Workspace ${id} initialized`);
 *   // No return - framework adds lifecycle defaults
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
