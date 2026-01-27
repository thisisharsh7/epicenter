/**
 * defineWorkspace() - High-level API for creating workspaces with tables, KV, and capabilities.
 *
 * @example
 * ```typescript
 * import { defineWorkspace, defineTable, defineKv } from 'epicenter/static';
 * import { type } from 'arktype';
 *
 * const posts = defineTable()
 *   .version(type({ id: 'string', title: 'string' }))
 *   .migrate((row) => row);
 *
 * const theme = defineKv()
 *   .version(type({ mode: "'light' | 'dark'" }))
 *   .migrate((v) => v);
 *
 * const workspace = defineWorkspace({
 *   id: 'my-app',
 *   tables: { posts },
 *   kv: { theme },
 * });
 *
 * // Synchronous creation
 * const client = workspace.create();
 *
 * // With capabilities
 * const client = workspace.create({ sqlite, persistence });
 * await client.capabilities.persistence.whenSynced;
 * ```
 */

import * as Y from 'yjs';
import { createKv } from './create-kv.js';
import { createTables } from './create-tables.js';
import type {
	CapabilityFactory,
	CapabilityMap,
	InferCapabilityExports,
	KvDefinitions,
	KvHelper,
	TableDefinitions,
	TablesHelper,
	WorkspaceClient,
	WorkspaceDefinition,
} from './types.js';

/**
 * Defines a workspace with tables, KV stores, and optional capabilities.
 *
 * The returned workspace definition can be used to create workspace clients
 * with `.create()`.
 *
 * @param config - Workspace configuration
 * @param config.id - Workspace identifier (used as Y.Doc guid)
 * @param config.tables - Optional map of table definitions
 * @param config.kv - Optional map of KV definitions
 * @returns WorkspaceDefinition with `.create()` method
 */
export function defineWorkspace<
	TId extends string,
	TTableDefinitions extends TableDefinitions = {},
	TKvDefinitions extends KvDefinitions = {},
>({
	id,
	tables: tableDefinitions = {} as TTableDefinitions,
	kv: kvDefinitions = {} as TKvDefinitions,
}: {
	id: TId;
	tables?: TTableDefinitions;
	kv?: TKvDefinitions;
}): WorkspaceDefinition<TId, TTableDefinitions, TKvDefinitions> {

	return {
		id,
		tableDefinitions,
		kvDefinitions,

		create<TCapabilities extends CapabilityMap = {}>(
			capabilities?: TCapabilities,
		): WorkspaceClient<TId, TTableDefinitions, TKvDefinitions, TCapabilities> {
			// Create Y.Doc with workspace id as guid
			const ydoc = new Y.Doc({ guid: id });

			// Create tables and KV helpers
			const tables = createTables(ydoc, tableDefinitions);
			const kv = createKv(ydoc, kvDefinitions);

			// Initialize capabilities
			const capabilityExports: Record<string, unknown> = {};
			const destroyCallbacks: (() => Promise<void>)[] = [];

			if (capabilities) {
				for (const [name, factory] of Object.entries(capabilities)) {
					const exports = (factory as CapabilityFactory)({
						ydoc,
						tables,
						kv,
					});
					capabilityExports[name] = exports;

					// Track destroy callbacks
					if (exports && typeof exports === 'object' && 'destroy' in exports) {
						const destroy = (exports as { destroy?: () => Promise<void> }).destroy;
						if (typeof destroy === 'function') {
							destroyCallbacks.push(destroy);
						}
					}
				}
			}

			// Destroy function
			async function destroy(): Promise<void> {
				// Call capability destroy functions in reverse order
				for (let i = destroyCallbacks.length - 1; i >= 0; i--) {
					await destroyCallbacks[i]!();
				}
				ydoc.destroy();
			}

			return {
				id,
				ydoc,
				tables: tables as TablesHelper<TTableDefinitions>,
				kv: kv as KvHelper<TKvDefinitions>,
				capabilities: capabilityExports as InferCapabilityExports<TCapabilities>,
				destroy,
				[Symbol.asyncDispose]: destroy,
			};
		},
	};
}

// Re-export types for convenience
export type {
	CapabilityFactory,
	CapabilityMap,
	WorkspaceClient,
	WorkspaceDefinition,
};
