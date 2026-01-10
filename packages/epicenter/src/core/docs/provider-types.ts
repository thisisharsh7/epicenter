import type * as Y from 'yjs';
import { defineExports, type Lifecycle, type MaybePromise } from '../lifecycle';

// Re-export lifecycle utilities for provider authors
export { defineExports, type Lifecycle, type MaybePromise } from '../lifecycle';

/**
 * Context provided to provider factories.
 *
 * Providers are doc-level (attached to Y.Doc), unlike capabilities which are
 * workspace-level (attached to workspace with tables, kv, etc.).
 *
 * Only the Y.Doc is provided; the doc ID is accessible via `ydoc.guid`.
 */
export type ProviderContext = {
	/** The underlying Y.Doc instance. */
	ydoc: Y.Doc;
};

/**
 * Provider exports - returned values accessible via `doc.providers.{name}`.
 *
 * This type combines the lifecycle protocol with custom exports.
 * The framework guarantees `whenSynced` and `destroy` exist on all providers.
 *
 * @typeParam T - Additional exports beyond lifecycle fields
 *
 * @example
 * ```typescript
 * // Type for a provider that exports a connection
 * type SyncProviderExports = ProviderExports<{ connection: WebSocket }>;
 * // → { whenSynced, destroy, connection }
 *
 * // Type for a provider with no custom exports
 * type SimpleProviderExports = ProviderExports;
 * // → { whenSynced, destroy }
 * ```
 */
export type ProviderExports<T extends Record<string, unknown> = {}> =
	Lifecycle & T;

/**
 * A provider factory function.
 *
 * Supports both sync and async factories (sync construction pattern).
 * Sync factories return immediately; async work is tracked via `whenSynced`.
 *
 * The framework normalizes all returns, so you can:
 * - Return void (framework provides default lifecycle)
 * - Return a plain object (framework adds `whenSynced` and `destroy` defaults)
 * - Return via `defineExports()` (explicit lifecycle)
 *
 * The optional lifecycle fields:
 * - `whenSynced?: Promise<unknown>` - Resolves when initialization complete (default: resolved)
 * - `destroy?: () => MaybePromise<void>` - Cleanup function (default: no-op)
 *
 * @example Persistence provider
 * ```typescript
 * const persistence: ProviderFactory = ({ ydoc }) => {
 *   const provider = new IndexeddbPersistence(ydoc.guid, ydoc);
 *   return defineExports({
 *     whenSynced: provider.whenSynced,
 *     destroy: () => provider.destroy(),
 *   });
 * };
 * ```
 *
 * @example Sync provider
 * ```typescript
 * const websocket: ProviderFactory = ({ ydoc }) => {
 *   const ws = new WebsocketProvider(url, ydoc.guid, ydoc);
 *   return defineExports({
 *     ws,
 *     whenSynced: new Promise(r => ws.on('sync', r)),
 *     destroy: () => ws.destroy(),
 *   });
 * };
 * ```
 */
export type ProviderFactory<
	TExports extends ProviderExports = ProviderExports,
> = (context: ProviderContext) => MaybePromise<TExports | void>;

/**
 * Map of provider factories keyed by provider ID.
 */
export type ProviderFactoryMap = Record<string, ProviderFactory>;

/**
 * Infer exports from provider factories.
 */
export type InferProviderExports<T extends ProviderFactoryMap> = {
	[K in keyof T]: Awaited<ReturnType<T[K]>>;
};

/**
 * Helper to define provider exports with proper typing and lifecycle normalization.
 *
 * Automatically fills in missing `whenSynced` and `destroy` fields with defaults.
 * Use this at the return site of your provider factory for explicit lifecycle.
 *
 * This is an alias for `defineExports()` for consistency with `defineCapabilities()`.
 *
 * @example
 * ```typescript
 * const persistence: ProviderFactory = ({ ydoc }) => {
 *   const provider = new IndexeddbPersistence(ydoc.guid, ydoc);
 *   return defineProviders({
 *     whenSynced: provider.whenSynced,
 *     destroy: () => provider.destroy(),
 *   });
 * };
 * ```
 */
export function defineProviders<T extends Record<string, unknown>>(
	exports: T,
): ProviderExports<T> {
	return defineExports(exports);
}
