/**
 * Capability types and utilities.
 *
 * Single source of truth for the capability protocol. Works across Node.js and browser.
 * Capabilities receive filesystem paths via their config, not through context.
 */

import type * as Y from 'yjs';
import type { Tables } from './tables/create-tables';
import type { Kv } from './kv/core';
import type { KvSchema, FieldsSchemaMap } from './schema';
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
 *   return { db, destroy: () => db.close() };
 * };
 * ```
 *
 * ### 3. Real-time sync (sync capability)
 * ```typescript
 * const websocketSync: CapabilityFactory = ({ ydoc }) => {
 *   const ws = new WebsocketProvider(url, ydoc.guid, ydoc);
 *   return { destroy: () => ws.destroy() };
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
 * Capabilities can return exports accessible via `client.capabilities.{name}`:
 * - `destroy?: () => void | Promise<void>` - Cleanup function called on `client.destroy()`
 * - `whenSynced?: Promise<unknown>` - Resolves when initial sync completes
 * - Any custom exports (db connections, helper methods, etc.)
 *
 * Capabilities that return `void` simply attach behavior without exports.
 *
 * ## Environment Detection
 *
 * Capabilities that need filesystem paths should accept them via their config parameter.
 * Use `typeof process !== 'undefined'` to detect Node.js/Bun vs browser environments.
 */
export type CapabilityContext<
	TFieldsSchemaMap extends FieldsSchemaMap = FieldsSchemaMap,
	TKvSchema extends KvSchema = KvSchema,
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
	tables: Tables<TFieldsSchemaMap>;

	/**
	 * Typed KV helpers.
	 * Use for simple key-value storage within the workspace.
	 */
	kv: Kv<TKvSchema>;
};

/**
 * Capability exports - returned values accessible via `client.capabilities.{name}`.
 */
export type CapabilityExports = {
	whenSynced?: Promise<unknown>;
	destroy?: () => void | Promise<void>;
	[key: string]: unknown;
};

/**
 * A capability factory function that attaches functionality to a workspace.
 *
 * Capability factories receive context and return exports (or void).
 * The exports become accessible via `client.capabilities.{name}`.
 */
export type CapabilityFactory<
	TFieldsSchemaMap extends FieldsSchemaMap = FieldsSchemaMap,
	TKvSchema extends KvSchema = KvSchema,
	TExports extends CapabilityExports = CapabilityExports,
> = (
	context: CapabilityContext<TFieldsSchemaMap, TKvSchema>,
) => TExports | void | Promise<TExports | void>;

/**
 * A map of capability factory functions keyed by capability ID.
 *
 * Capability factories add functionality to workspaces: persistence, sync, SQL queries, etc.
 * Each factory receives context and optionally returns exports accessible via
 * `client.capabilities[capabilityId]`.
 */
export type CapabilityFactoryMap<
	TFieldsSchemaMap extends FieldsSchemaMap = FieldsSchemaMap,
	TKvSchema extends KvSchema = KvSchema,
> = Record<string, CapabilityFactory<TFieldsSchemaMap, TKvSchema>>;

/**
 * Utility type to infer the exports from a capability factory map.
 *
 * Maps each capability key to its return type (unwrapped from Promise if async).
 * Factories that return void produce empty objects.
 */
export type InferCapabilityExports<TCapabilityFactories> = {
	[K in keyof TCapabilityFactories]: TCapabilityFactories[K] extends CapabilityFactory<
		FieldsSchemaMap,
		KvSchema,
		infer TExports
	>
		? TExports extends CapabilityExports
			? TExports
			: Record<string, never>
		: Record<string, never>;
};

/**
 * Helper to define capability exports with proper typing.
 */
export function defineCapabilities<T extends CapabilityExports>(exports: T): T {
	return exports;
}
