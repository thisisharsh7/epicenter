/**
 * Node.js/CLI convenience wrapper for workspace creation.
 *
 * Provides an async `defineWorkspace()` that awaits `whenSynced` internally,
 * returning a fully initialized client without the `whenSynced` property.
 *
 * Use this for CLI scripts, servers, and migrations where you want to
 * await creation rather than use a render gate pattern.
 *
 * @example
 * ```typescript
 * import { defineWorkspace } from '@epicenter/hq/node';
 *
 * const workspace = defineWorkspace({ id, slug, name, tables, kv });
 * const client = await workspace.create({ capabilities: { sqlite } });
 * // Ready to use - no need to await whenSynced
 * ```
 *
 * @module
 */

import type {
	CapabilityFactoryMap,
	InferCapabilityExports,
} from '../capability';
import type { LifecycleExports } from '../lifecycle';
import type { KvSchema, TableDefinitionMap } from '../schema';
import {
	defineWorkspace as defineWorkspaceSync,
	type WorkspaceSchema,
	type WorkspaceClient as WorkspaceClientSync,
} from './contract';

/**
 * Workspace client type for Node.js (without whenSynced - already resolved).
 *
 * This type omits `whenSynced` since the async `create()` wrapper
 * awaits it internally before returning.
 */
export type WorkspaceClient<
	TTableDefinitionMap extends TableDefinitionMap = TableDefinitionMap,
	TKvSchema extends KvSchema = KvSchema,
	TCapabilityExports extends Record<string, LifecycleExports> = Record<
		string,
		LifecycleExports
	>,
> = Omit<
	WorkspaceClientSync<TTableDefinitionMap, TKvSchema, TCapabilityExports>,
	'whenSynced'
>;

/**
 * Workspace type for Node.js with async create() method.
 */
export type Workspace<
	TTableDefinitionMap extends TableDefinitionMap = TableDefinitionMap,
	TKvSchema extends KvSchema = KvSchema,
> = WorkspaceSchema<TTableDefinitionMap, TKvSchema> & {
	/**
	 * Create a workspace client (async - awaits whenSynced internally).
	 *
	 * Unlike the browser version, this returns a Promise that resolves
	 * when all capabilities are fully initialized.
	 *
	 * @example
	 * ```typescript
	 * const client = await workspace.create({
	 *   capabilities: { sqlite, persistence },
	 * });
	 * // Ready to use immediately
	 * client.tables.posts.upsert({ id: '1', title: 'Hello' });
	 * ```
	 */
	create<
		TCapabilityFactories extends CapabilityFactoryMap<
			TTableDefinitionMap,
			TKvSchema
		> = {},
	>(options?: {
		epoch?: number;
		capabilities?: TCapabilityFactories;
	}): Promise<
		WorkspaceClient<
			TTableDefinitionMap,
			TKvSchema,
			InferCapabilityExports<TCapabilityFactories>
		>
	>;
};

/**
 * Define a workspace with async create() for Node.js/CLI usage.
 *
 * This is a convenience wrapper around the browser `defineWorkspace()`.
 * The `create()` method awaits `whenSynced` internally so you get a
 * fully initialized client without needing a render gate.
 *
 * @example
 * ```typescript
 * import { defineWorkspace } from '@epicenter/hq/node';
 *
 * const workspace = defineWorkspace({
 *   id: generateGuid(),
 *   slug: 'blog',
 *   name: 'Blog',
 *   tables: { posts: { ... } },
 *   kv: {},
 * });
 *
 * // Async - awaits initialization internally
 * const client = await workspace.create({
 *   capabilities: { sqlite, persistence },
 * });
 *
 * // Ready to use
 * client.tables.posts.upsert({ id: '1', title: 'Hello' });
 * await client.destroy();
 * ```
 */
export function defineWorkspace<
	TTableDefinitionMap extends TableDefinitionMap,
	TKvSchema extends KvSchema = Record<string, never>,
>(
	config: WorkspaceSchema<TTableDefinitionMap, TKvSchema>,
): Workspace<TTableDefinitionMap, TKvSchema> {
	const syncWorkspace = defineWorkspaceSync(config);

	return {
		...config,

		async create<
			TCapabilityFactories extends CapabilityFactoryMap<
				TTableDefinitionMap,
				TKvSchema
			> = {},
		>(
			options: { epoch?: number; capabilities?: TCapabilityFactories } = {},
		): Promise<
			WorkspaceClient<
				TTableDefinitionMap,
				TKvSchema,
				InferCapabilityExports<TCapabilityFactories>
			>
		> {
			const client = syncWorkspace.create(options);

			// Await whenSynced internally
			await client.whenSynced;

			// Return client without whenSynced property
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			const { whenSynced: _, ...clientWithoutWhenSynced } = client;

			return clientWithoutWhenSynced as WorkspaceClient<
				TTableDefinitionMap,
				TKvSchema,
				InferCapabilityExports<TCapabilityFactories>
			>;
		},
	};
}

// Re-export common types and utilities for convenience
export type { WorkspaceSchema } from './contract';
export {
	// Schema utilities
	boolean,
	cover,
	date,
	generateGuid,
	generateId,
	icon,
	id,
	integer,
	json,
	real,
	richtext,
	select,
	table,
	tags,
	text,
} from '../schema';
