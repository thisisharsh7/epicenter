/**
 * Capability types and utilities.
 *
 * Single source of truth for capability context. Works across Node.js and browser.
 * - Node.js: `paths` is defined (CapabilityPaths)
 * - Browser: `paths` is undefined
 */

import type * as Y from 'yjs';
import type { Tables } from './tables/create-tables';
import type { Kv } from './kv/core';
import type { KvSchema, TablesSchema } from './schema';
import type { CapabilityPaths } from './types';

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
 * const persistence: Capability = ({ ydoc, paths }) => {
 *   const saved = loadFromDisk(paths.capability);
 *   Y.applyUpdate(ydoc, saved);
 *   ydoc.on('update', () => {
 *     saveToDisk(paths.capability, Y.encodeStateAsUpdate(ydoc));
 *   });
 * };
 * ```
 *
 * ### 2. Sync tables to external store (materializer capability)
 * ```typescript
 * const sqlite: Capability = ({ tables, paths }) => {
 *   const db = new Database(paths.capability + '/data.db');
 *   for (const table of tables.$all()) {
 *     table.observe({
 *       onAdd: (row) => db.insert(table.name, row),
 *       onUpdate: (row) => db.update(table.name, row),
 *       onDelete: (id) => db.delete(table.name, id),
 *     });
 *   }
 *   return { db, destroy: () => db.close() };
 * };
 * ```
 *
 * ### 3. Real-time sync (sync capability)
 * ```typescript
 * const websocketSync: Capability = ({ ydoc }) => {
 *   const ws = new WebsocketProvider(url, ydoc.guid, ydoc);
 *   return { destroy: () => ws.destroy() };
 * };
 * ```
 *
 * ### 4. Do nothing with data (pure side-effect capability)
 * ```typescript
 * const logger: Capability = ({ id }) => {
 *   console.log(`Workspace ${id} initialized`);
 * };
 * ```
 *
 * ## What Capabilities Can Return
 *
 * Capabilities can return exports accessible via `client.capabilities.{name}`:
 * - `destroy?: () => void | Promise<void>` — Cleanup function called on `client.destroy()`
 * - `whenSynced?: Promise<unknown>` — Resolves when initial sync completes
 * - Any custom exports (db connections, helper methods, etc.)
 *
 * Capabilities that return `void` simply attach behavior without exports.
 *
 * ## Environment Detection
 *
 * The `paths` property discriminates between environments:
 * - **Node.js/Bun**: `paths` is defined with project, epicenter, and capability directories
 * - **Browser**: `paths` is undefined (use IndexedDB or other browser APIs)
 */
export type CapabilityContext<
	TTablesSchema extends TablesSchema = TablesSchema,
	TKvSchema extends KvSchema = KvSchema,
> = {
	/** Workspace ID (e.g., 'blog', 'notes') */
	id: string;

	/**
	 * This capability's key from `.withCapabilities({ key: ... })`.
	 * Useful for namespacing storage paths.
	 */
	capabilityId: string;

	/**
	 * The underlying YJS document.
	 * Use for doc-level operations: persistence, sync, undo/redo.
	 */
	ydoc: Y.Doc;

	/**
	 * Typed table helpers.
	 * Use `tables.$all()` to iterate, or `tables.posts.observe()` for specific tables.
	 */
	tables: Tables<TTablesSchema>;

	/**
	 * Typed KV helpers.
	 * Use for simple key-value storage within the workspace.
	 */
	kv: Kv<TKvSchema>;

	/**
	 * Filesystem paths (undefined in browser).
	 * - `paths.project`: Project root
	 * - `paths.epicenter`: `.epicenter` directory
	 * - `paths.capability`: `.epicenter/capabilities/{capabilityId}/`
	 */
	paths: CapabilityPaths | undefined;
};

/**
 * Capability exports - returned values accessible via `capabilities.{name}`.
 */
export type Capabilities = {
	whenSynced?: Promise<unknown>;
	destroy?: () => void | Promise<void>;
	[key: string]: unknown;
};

export type WorkspaceCapabilityMap = Record<string, Capabilities>;

export type InferCapabilities<P> = P extends (context: any) => infer R
	? Awaited<R>
	: Record<string, never>;

export function defineCapabilities<T extends Capabilities>(exports: T): T {
	return exports;
}

/**
 * A capability function that attaches functionality to a workspace.
 */
export type Capability<
	TTablesSchema extends TablesSchema = TablesSchema,
	TKvSchema extends KvSchema = KvSchema,
	TExports extends Capabilities = Capabilities,
> = (
	context: CapabilityContext<TTablesSchema, TKvSchema>,
) => TExports | void | Promise<TExports | void>;
