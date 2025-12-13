/**
 * Shared provider types and utilities.
 *
 * Platform-specific entry points (provider.browser.ts, provider.node.ts) extend
 * these base types with platform-appropriate properties.
 */

import type * as Y from 'yjs';
import type { Tables } from './db/core';
import type { WorkspaceSchema } from './schema';

/**
 * Base provider context shared across all platforms.
 *
 * Platform-specific contexts extend this with:
 * - Browser: No additional fields (no filesystem access)
 * - Node/Bun: `storageDir` and `epicenterDir` (required, not undefined)
 */
export type ProviderContextBase<
	TSchema extends WorkspaceSchema = WorkspaceSchema,
> = {
	/** The workspace ID (e.g., 'blog', 'content-hub') */
	id: string;
	/** This provider's key in the providers map (e.g., 'sqlite', 'persistence') */
	providerId: string;
	/** The YJS document that providers can attach to */
	ydoc: Y.Doc;
	/** The workspace schema (table definitions) */
	schema: TSchema;
	/** The Epicenter tables instance for observing/querying data */
	tables: Tables<TSchema>;
};

/**
 * Provider exports type - an object with optional lifecycle hooks and any exported resources.
 *
 * Providers that materialize views (SQLite, markdown, vector, etc.) can return exports
 * that are accessible in the workspace exports factory via `providers.providerName.exportName`.
 *
 * **Lifecycle hooks:**
 * - `whenSynced`: Optional promise that resolves when the provider has completed initial sync
 * - `destroy()`: Optional cleanup function called during workspace cleanup
 *
 * @example Browser provider (sync construction, deferred sync)
 * ```typescript
 * return defineProviderExports({
 *   whenSynced: persistence.whenSynced,
 *   destroy: () => persistence.destroy(),
 * });
 * ```
 *
 * @example Node provider (async construction)
 * ```typescript
 * return defineProviderExports({
 *   destroy: () => client.close(),
 *   db: sqliteDb,
 *   posts: postsTable,
 * });
 * ```
 *
 * @see https://github.com/yjs/y-indexeddb - Inspiration for the whenSynced pattern
 */
export type ProviderExports = {
	/**
	 * Optional promise that resolves when the provider has completed initial sync.
	 *
	 * This follows the y-indexeddb pattern: construction is synchronous,
	 * but providers may load data asynchronously in the background.
	 *
	 * If provided, this will be included in the workspace's aggregated `whenSynced`.
	 *
	 * Note: Typed as `Promise<unknown>` because different providers return different
	 * values. For example, y-indexeddb's `persistence.whenSynced` returns
	 * `Promise<IndexeddbPersistence>`, not `Promise<void>`. Consumers should only
	 * await this promise, not rely on its resolved value.
	 *
	 * @example
	 * ```typescript
	 * const persistence = new IndexeddbPersistence(ydoc.guid, ydoc);
	 * return defineProviderExports({
	 *   whenSynced: persistence.whenSynced,
	 *   destroy: () => persistence.destroy(),
	 * });
	 * ```
	 */
	whenSynced?: Promise<unknown>;

	/**
	 * Optional cleanup function called during workspace cleanup.
	 */
	destroy?: () => void | Promise<void>;

	[key: string]: unknown;
};

/**
 * A collection of workspace providers indexed by provider name.
 *
 * Each workspace can have multiple providers (persistence, sync, materializers, etc.)
 * that attach to the workspace and optionally provide exports.
 */
export type WorkspaceProviderMap = Record<string, ProviderExports>;

/**
 * Infer the exports type from a provider function.
 *
 * Extracts the return type from a provider, unwrapping Promise.
 *
 * @example
 * ```typescript
 * // Provider that returns exports
 * const myProvider = ({ ydoc }) => defineProviderExports({ db: sqlite });
 * type Exports = InferProviderExports<typeof myProvider>;
 * // Exports = { db: typeof sqlite }
 *
 * // Provider that returns empty exports
 * const loggingProvider = ({ ydoc }) => defineProviderExports({});
 * type Exports = InferProviderExports<typeof loggingProvider>;
 * // Exports = {}
 * ```
 */
export type InferProviderExports<P> = P extends (context: any) => infer R
	? Awaited<R>
	: Record<string, never>;

/**
 * Define provider exports with type safety (identity function).
 *
 * @example
 * ```typescript
 * return defineProviderExports({
 *   destroy: () => client.close(),
 *   db: sqliteDb,
 *   findById: async (id: string) => { ... }
 * });
 * // Type is inferred as { destroy: () => void, db: typeof sqliteDb, findById: (id: string) => Promise<...> }
 * ```
 */
export function defineProviderExports<T extends ProviderExports>(
	exports: T,
): T {
	return exports;
}

