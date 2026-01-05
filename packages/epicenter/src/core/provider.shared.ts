/**
 * Provider types and utilities.
 *
 * Single source of truth for provider context. Works across Node.js and browser.
 * - Node.js: `paths` is defined (ProviderPaths)
 * - Browser: `paths` is undefined
 */

import type * as Y from 'yjs';
import type { Tables } from './tables/core';
import type { Kv } from './kv/core';
import type { KvSchema, TablesSchema } from './schema';
import type { ProviderPaths } from './types';

/**
 * Context provided to each provider function.
 *
 * Both `tables` and `kv` are always present (never undefined). Workspaces that
 * don't define a KV schema receive an empty KV object with just utility methods.
 *
 * The `paths` property discriminates between environments:
 * - Node.js/Bun: `paths` is defined with project, epicenter, and provider directories
 * - Browser: `paths` is undefined (use IndexedDB or other browser APIs)
 */
export type ProviderContext<
	TTablesSchema extends TablesSchema = TablesSchema,
	TKvSchema extends KvSchema = KvSchema,
> = {
	id: string;
	providerId: string;
	ydoc: Y.Doc;
	tables: Tables<TTablesSchema>;
	kv: Kv<TKvSchema>;
	paths: ProviderPaths | undefined;
};

/**
 * Provider exports - returned values accessible via `providers.{name}`.
 */
export type Providers = {
	whenSynced?: Promise<unknown>;
	destroy?: () => void | Promise<void>;
	[key: string]: unknown;
};

export type WorkspaceProviderMap = Record<string, Providers>;

export type InferProviders<P> = P extends (context: any) => infer R
	? Awaited<R>
	: Record<string, never>;

export function defineProviders<T extends Providers>(exports: T): T {
	return exports;
}

/**
 * A provider function that attaches capabilities to a workspace.
 */
export type Provider<
	TTablesSchema extends TablesSchema = TablesSchema,
	TKvSchema extends KvSchema = KvSchema,
	TExports extends Providers = Providers,
> = (
	context: ProviderContext<TTablesSchema, TKvSchema>,
) => TExports | void | Promise<TExports | void>;
