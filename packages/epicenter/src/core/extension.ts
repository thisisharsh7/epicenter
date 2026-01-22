/**
 * Extension types and utilities.
 *
 * Single source of truth for the extension protocol. Works across Node.js and browser.
 * Extensions receive filesystem paths via their config, not through context.
 *
 * ## Extensions vs Providers
 *
 * - **Providers** (doc-level): True YJS providers for sync/persistence on raw Y.Docs
 *   (Head Doc, Registry Doc). Receive minimal context: `{ ydoc }`.
 *
 * - **Extensions** (workspace-level): Plugins that extend workspaces with features
 *   like SQLite queries, Markdown sync, revision history. Receive rich context:
 *   `{ id, extensionId, ydoc, tables, kv }`.
 *
 * Use `defineExports()` to wrap your extension's return value for lifecycle normalization.
 */

import type * as Y from 'yjs';
import type { WorkspaceDoc } from './docs/workspace-doc';
import type { Kv } from './kv/core';
import type { Lifecycle } from './lifecycle';
import type { KvDefinitionMap, TableDefinitionMap } from './schema';
import type { Tables } from './tables/create-tables';

// Re-export lifecycle utilities for extension authors
export { defineExports, type Lifecycle } from './lifecycle';

/**
 * Context provided to each extension function.
 *
 * An extension is a function that attaches behavior to a workspace.
 * The context gives access to the workspace's core primitives, and
 * the extension decides what to use based on its purpose.
 *
 * ## Common Patterns
 *
 * ### 1. Persist the entire YDoc (storage extension)
 * ```typescript
 * const persistence: ExtensionFactory = ({ ydoc }, config) => {
 *   const saved = loadFromDisk(config.path);
 *   Y.applyUpdate(ydoc, saved);
 *   ydoc.on('update', () => {
 *     saveToDisk(config.path, Y.encodeStateAsUpdate(ydoc));
 *   });
 *   return defineExports();
 * };
 * ```
 *
 * ### 2. Sync tables to external store (materializer extension)
 * ```typescript
 * const sqlite: ExtensionFactory = ({ tables }, config) => {
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
 * ### 3. Real-time sync (sync extension)
 * ```typescript
 * const websocketSync: ExtensionFactory = ({ ydoc }) => {
 *   const ws = new WebsocketProvider(url, ydoc.guid, ydoc);
 *   return defineExports({
 *     whenSynced: new Promise(r => ws.on('sync', r)),
 *     destroy: () => ws.destroy(),
 *   });
 * };
 * ```
 *
 * ### 4. Do nothing with data (pure side-effect extension)
 * ```typescript
 * const logger: ExtensionFactory = ({ id }) => {
 *   console.log(`Workspace ${id} initialized`);
 *   return defineExports();
 * };
 * ```
 *
 * ## What Extensions Can Return
 *
 * Extension factories are **always synchronous**. Async initialization is tracked
 * via the returned `whenSynced` promise, not the factory itself.
 *
 * Use `defineExports()` to wrap your return for explicit type safety.
 * The framework fills in defaults for missing lifecycle fields:
 * - `whenSynced`: defaults to `Promise.resolve()`
 * - `destroy`: defaults to no-op `() => {}`
 *
 * Any additional properties become accessible via `client.extensions.{name}`.
 *
 * ## Environment Detection
 *
 * Extensions that need filesystem paths should accept them via their config parameter.
 * Use `typeof process !== 'undefined'` to detect Node.js/Bun vs browser environments.
 */
export type ExtensionContext<
	TTableDefinitionMap extends TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap,
> = {
	/**
	 * Human-readable workspace identifier for URLs, paths, and sync.
	 * Format: lowercase alphanumeric with dots and hyphens (e.g., "my-notes", "epicenter.whispering").
	 */
	id: string;

	/**
	 * This extension's key from `.create({ extensions: { key: ... } })`.
	 * Useful for namespacing storage paths or logging.
	 */
	extensionId: string;

	/**
	 * The Workspace Doc wrapper providing typed access to Y.Maps.
	 *
	 * Use this for:
	 * - Schema access: `workspaceDoc.getSchema()`, `workspaceDoc.getSchemaMap()`
	 * - KV map access: `workspaceDoc.getKvMap()`
	 * - Tables map access: `workspaceDoc.getTablesMap()`
	 * - Observation: `workspaceDoc.observeSchema()`
	 *
	 * The raw `ydoc` is also available for doc-level operations.
	 */
	workspaceDoc: WorkspaceDoc;

	/**
	 * The underlying YJS document.
	 * Use for doc-level operations: persistence, sync, undo/redo.
	 *
	 * For accessing the top-level Y.Maps (schema, kv, tables), prefer
	 * using `workspaceDoc` methods instead.
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
 * Extension exports - returned values accessible via `client.extensions.{name}`.
 *
 * This type combines the lifecycle protocol with custom exports.
 * The framework guarantees `whenSynced` and `destroy` exist on all extensions.
 *
 * @typeParam T - Additional exports beyond lifecycle fields
 *
 * @example
 * ```typescript
 * // Type for an extension that exports a database
 * type SqliteExtensionExports = ExtensionExports<{ db: Database }>;
 * // → { whenSynced, destroy, db }
 *
 * // Type for an extension with no custom exports
 * type SimpleExtensionExports = ExtensionExports;
 * // → { whenSynced, destroy }
 * ```
 */
export type ExtensionExports<T extends Record<string, unknown> = {}> =
	Lifecycle & T;

/**
 * An extension factory function that attaches functionality to a workspace.
 *
 * Factories are **always synchronous**. Async initialization is tracked via
 * the returned `whenSynced` promise, not the factory itself.
 *
 * Use `defineExports()` to wrap your return for explicit type safety.
 * The framework fills in defaults for missing fields:
 * - `whenSynced`: defaults to `Promise.resolve()`
 * - `destroy`: defaults to no-op `() => {}`
 *
 * @example
 * ```typescript
 * const persistence: ExtensionFactory = ({ ydoc }) => {
 *   const provider = new IndexeddbPersistence(ydoc.guid, ydoc);
 *   return defineExports({
 *     whenSynced: provider.whenSynced,
 *     destroy: () => provider.destroy(),
 *   });
 * };
 * ```
 */
export type ExtensionFactory<
	TTableDefinitionMap extends TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap,
	TExports extends ExtensionExports = ExtensionExports,
> = (
	context: ExtensionContext<TTableDefinitionMap, TKvDefinitionMap>,
) => TExports;

/**
 * A map of extension factory functions keyed by extension ID.
 *
 * Extension factories add functionality to workspaces: persistence, sync, SQL queries, etc.
 * Each factory receives context and optionally returns exports accessible via
 * `client.extensions[extensionId]`.
 */
export type ExtensionFactoryMap<
	TTableDefinitionMap extends TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap,
> = Record<string, ExtensionFactory<TTableDefinitionMap, TKvDefinitionMap>>;

/**
 * Utility type to infer exports from an extension factory map.
 *
 * Maps each extension key to its return type. Factories are always synchronous,
 * so no Promise unwrapping is needed.
 */
export type InferExtensionExports<TExtensionFactories> = {
	[K in keyof TExtensionFactories]: TExtensionFactories[K] extends ExtensionFactory<
		TableDefinitionMap,
		KvDefinitionMap,
		infer TExports
	>
		? TExports extends ExtensionExports
			? TExports
			: ExtensionExports
		: ExtensionExports;
};
