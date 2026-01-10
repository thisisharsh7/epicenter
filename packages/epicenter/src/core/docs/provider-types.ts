import type * as Y from 'yjs';

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
 * Both `whenSynced` and `destroy` are required.
 */
export type ProviderExports = {
	whenSynced: Promise<unknown>;
	destroy: () => void | Promise<void>;
	[key: string]: unknown;
};

/**
 * A provider factory function. Always async.
 */
export type ProviderFactory<
	TExports extends ProviderExports = ProviderExports,
> = (context: ProviderContext) => Promise<TExports>;

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
