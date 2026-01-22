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
 *   like SQLite queries, Markdown sync, revision history. Receive context:
 *   `{ workspaceDoc, extensionId }`.
 *
 * Use `defineExports()` to wrap your extension's return value for lifecycle normalization.
 */

import type { WorkspaceDoc } from './docs/workspace-doc';
import type { Lifecycle } from './lifecycle';
import type { KvDefinitionMap, TableDefinitionMap } from './schema';

// Re-export lifecycle utilities for extension authors
export { defineExports, type Lifecycle } from './lifecycle';

/**
 * Context provided to each extension function.
 *
 * An extension is a function that attaches behavior to a workspace.
 * The context provides access to the workspace doc (which contains everything)
 * and the extension's own ID for namespacing.
 *
 * ## Accessing Workspace Data
 *
 * All workspace data is accessed through `workspaceDoc`:
 * - `workspaceDoc.ydoc` - The underlying Y.Doc
 * - `workspaceDoc.tables` - Typed table helpers
 * - `workspaceDoc.kv` - Key-value store helpers
 * - `workspaceDoc.workspaceId` - The workspace identifier
 * - `workspaceDoc.epoch` - The current epoch number
 * - `workspaceDoc.getSchema()` - Read schema as plain object
 * - `workspaceDoc.getSchemaMap()` - Raw Y.Map for schema
 *
 * ## Common Patterns
 *
 * ### 1. Persist the entire YDoc (storage extension)
 * ```typescript
 * const persistence: ExtensionFactory = ({ workspaceDoc }, config) => {
 *   const { ydoc } = workspaceDoc;
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
 * const sqlite: ExtensionFactory = ({ workspaceDoc }, config) => {
 *   const { tables } = workspaceDoc;
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
 * const websocketSync: ExtensionFactory = ({ workspaceDoc }) => {
 *   const { ydoc } = workspaceDoc;
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
 * const logger: ExtensionFactory = ({ workspaceDoc }) => {
 *   console.log(`Workspace ${workspaceDoc.workspaceId} initialized`);
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
	 * The Workspace Doc wrapper providing typed access to everything.
	 *
	 * Contains:
	 * - `ydoc` - The underlying Y.Doc
	 * - `tables` - Typed table helpers
	 * - `kv` - Key-value store helpers
	 * - `workspaceId` - The workspace identifier
	 * - `epoch` - The current epoch number
	 * - `getSchema()` - Read schema as plain object
	 * - `getSchemaMap()`, `getKvMap()`, `getTablesMap()` - Raw Y.Maps
	 * - `mergeSchema()` - Merge schema into Y.Doc
	 * - `observeSchema()` - React to schema changes
	 */
	workspaceDoc: WorkspaceDoc<TTableDefinitionMap, TKvDefinitionMap>;

	/**
	 * This extension's key from `.withExtensions({ key: ... })`.
	 * Useful for namespacing storage paths or logging.
	 */
	extensionId: string;
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
