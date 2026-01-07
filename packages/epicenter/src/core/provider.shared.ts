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
 * Both `tables` and `kv` are always present (never undefined). Workspaces that
 * don't define a KV schema receive an empty KV object with just utility methods.
 *
 * The `paths` property discriminates between environments:
 * - Node.js/Bun: `paths` is defined with project, epicenter, and capability directories
 * - Browser: `paths` is undefined (use IndexedDB or other browser APIs)
 */
export type CapabilityContext<
	TTablesSchema extends TablesSchema = TablesSchema,
	TKvSchema extends KvSchema = KvSchema,
> = {
	id: string;
	capabilityId: string;
	ydoc: Y.Doc;
	tables: Tables<TTablesSchema>;
	kv: Kv<TKvSchema>;
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
