import type * as Y from 'yjs';
import { LifecycleExports } from '../lifecycle';

// Re-export lifecycle utilities for convenience
export { LifecycleExports, type MaybePromise } from '../lifecycle';

/**
 * Context provided to provider factories.
 *
 * Only the Y.Doc is provided; the doc ID is accessible via `ydoc.guid`.
 */
export type ProviderContext = {
	/** The underlying Y.Doc instance. */
	ydoc: Y.Doc;
};

/**
 * Exports returned by a provider factory.
 *
 * Alias for LifecycleExports; both `whenSynced` and `destroy` are required.
 */
export type ProviderExports = LifecycleExports;

/**
 * A provider factory function.
 *
 * Supports both sync and async factories (sync construction pattern).
 * Sync factories return immediately; async work is tracked via `whenSynced`.
 */
export type ProviderFactory<
	TExports extends ProviderExports = ProviderExports,
> = (context: ProviderContext) => TExports | Promise<TExports>;

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
