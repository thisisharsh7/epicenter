/**
 * Shared workspace client types and utilities.
 *
 * This file contains platform-agnostic types used by both Node and browser clients.
 * Platform-specific types (e.g., `whenSynced` for browser) and initialization logic
 * remain in client.browser.ts and client.node.ts.
 */

import type * as Y from 'yjs';

import type { ActionContract, ActionContracts } from '../actions';
import type { Tables } from '../db/core';
import type { Kv } from '../kv';
import type { WorkspaceProviderMap } from '../provider';
import type { KvSchema, WorkspaceSchema, WorkspaceValidators } from '../schema';
import type { WorkspacePaths } from './config';

/**
 * Internal workspace client properties shared across all platforms.
 *
 * These properties are prefixed with `$` to distinguish them from user-defined actions
 * and mirror the actions context (passed to the `actions` factory in
 * `defineWorkspace`). Platform-specific files (browser/node) compose this
 * type with their own additions (e.g., browser adds `whenSynced`).
 *
 * @typeParam TSchema - The workspace's table schema
 * @typeParam TProviders - The workspace's provider map
 *
 * @example
 * ```typescript
 * // Browser client composes this with whenSynced:
 * type WorkspaceClient<TActions, TSchema, TProviders> =
 *   TActions & WorkspaceClientInternals<TSchema, TProviders> & { whenSynced: Promise<void> };
 *
 * // Node client uses it directly:
 * type WorkspaceClient<TActions, TSchema, TProviders> =
 *   TActions & WorkspaceClientInternals<TSchema, TProviders>;
 * ```
 */
export type WorkspaceClientInternals<
	TSchema extends WorkspaceSchema = WorkspaceSchema,
	TKvSchema extends KvSchema = KvSchema,
	TProviders extends WorkspaceProviderMap = WorkspaceProviderMap,
> = {
	/**
	 * The underlying YJS document for this workspace.
	 *
	 * Exposed for sync providers and advanced use cases.
	 * The document's guid matches the workspace ID.
	 */
	$ydoc: Y.Doc;

	/**
	 * Direct access to workspace tables for advanced operations.
	 *
	 * Use this for:
	 * - Direct table queries bypassing actions
	 * - Observing real-time changes via `$tables.posts.observe()`
	 * - Accessing Y.Text/Y.Array instances for collaborative editing
	 *
	 * @example
	 * ```typescript
	 * // Get a row with live YJS objects
	 * const result = client.$tables.posts.get({ id: '123' });
	 * if (result.status === 'valid') {
	 *   const ytext = result.row.content; // Y.Text for editor binding
	 * }
	 *
	 * // Observe changes
	 * client.$tables.posts.observe({
	 *   onAdd: (result) => console.log('New:', result),
	 *   onUpdate: (result) => console.log('Updated:', result),
	 * });
	 * ```
	 */
	$tables: Tables<TSchema>;

	/**
	 * KV store for singleton configuration and state values.
	 *
	 * Use this for settings, cursors, feature flags, and other singleton values
	 * that don't fit the table/rows model.
	 *
	 * @example
	 * ```typescript
	 * // Get and set KV values
	 * const theme = client.$kv.theme.get();  // → 'light'
	 * client.$kv.theme.set('dark');
	 *
	 * // Observe changes
	 * client.$kv.theme.observe((value) => {
	 *   console.log('Theme changed to:', value);
	 * });
	 * ```
	 */
	$kv: Kv<TKvSchema>;

	/**
	 * Direct access to workspace providers.
	 *
	 * Use this for provider-specific operations like:
	 * - SQLite queries via `$providers.sqlite`
	 * - Sync status via `$providers.sync`
	 *
	 * @example
	 * ```typescript
	 * const results = await client.$providers.sqlite.posts.select().all();
	 * ```
	 */
	$providers: TProviders;

	/** Schema validators for runtime validation and arktype composition. */
	$validators: WorkspaceValidators<TSchema>;

	/** Actions from dependency workspaces, keyed by workspace ID. */
	$workspaces: Record<string, ActionContracts>;

	/** Filesystem paths (undefined in browser environments). */
	$paths: WorkspacePaths | undefined;

	/**
	 * Pre-computed registry of this workspace's actions.
	 *
	 * Built during client initialization by walking the action tree.
	 * Use this for server/MCP tooling that needs to enumerate available actions.
	 *
	 * @example
	 * ```typescript
	 * // Iterate all actions in this workspace
	 * for (const { workspaceId, actionPath, action } of client.$actions) {
	 *   console.log(`${actionPath.join('/')}: ${action.type}`);
	 * }
	 *
	 * // Filter mutations only
	 * const mutations = client.$actions.filter(info => info.action.type === 'mutation');
	 * ```
	 */
	$actions: readonly ActionInfo[];

	/**
	 * Async cleanup method for resource management.
	 *
	 * Cleans up providers first (if they have `destroy` methods), then destroys
	 * the YJS document. Always call this when done with a client to prevent
	 * resource leaks.
	 */
	destroy: () => Promise<void>;

	/**
	 * Async disposal for `await using` syntax.
	 *
	 * @example
	 * ```typescript
	 * {
	 *   await using client = await createClient(workspace);
	 *   // ... use client ...
	 * } // Automatically cleaned up here
	 * ```
	 */
	[Symbol.asyncDispose]: () => Promise<void>;
};

/** Info about an action collected during client initialization. */
export type ActionInfo = {
	workspaceId: string;
	actionPath: string[];
	action: ActionContract;
};

/**
 * Base properties for multi-workspace Epicenter clients.
 *
 * Platform-specific files extend this with additional properties
 * (e.g., browser adds `whenSynced` for aggregate sync tracking).
 */
export type EpicenterClientBase = {
	/**
	 * Pre-computed registry of all workspace actions.
	 *
	 * Built during client initialization by walking all workspace action trees.
	 * Use this for server/MCP tooling that needs to enumerate available actions.
	 *
	 * @example
	 * ```typescript
	 * // Iterate all actions
	 * for (const { workspaceId, actionPath, action } of client.$actions) {
	 *   console.log(`${workspaceId}/${actionPath.join('/')}: ${action.type}`);
	 * }
	 *
	 * // Group by workspace
	 * const byWorkspace = Object.groupBy(client.$actions, info => info.workspaceId);
	 *
	 * // Filter mutations only
	 * const mutations = client.$actions.filter(info => info.action.type === 'mutation');
	 * ```
	 */
	$actions: readonly ActionInfo[];

	/**
	 * Workspace clients keyed by workspace ID.
	 *
	 * Use this to iterate over workspace clients without destructuring the
	 * EpicenterClient. Direct iteration over the client object would include
	 * non-workspace properties (`$actions`, `destroy`, `[Symbol.asyncDispose]`),
	 * requiring verbose destructuring to filter them out.
	 *
	 * @example
	 * ```typescript
	 * // Preferred: Use $workspaces for clean iteration
	 * for (const [id, workspace] of Object.entries(client.$workspaces)) {
	 *   console.log(id, workspace.$tables);
	 * }
	 *
	 * // Avoid: Destructuring to filter out non-workspace properties
	 * const { $actions, destroy, [Symbol.asyncDispose]: _, ...workspaces } = client;
	 * for (const [id, workspace] of Object.entries(workspaces)) { ... }
	 * ```
	 */
	$workspaces: Record<string, WorkspaceClientInternals>;

	/**
	 * Async cleanup method for resource management.
	 *
	 * Destroys all workspace clients in parallel.
	 */
	destroy: () => Promise<void>;

	/**
	 * Async disposal for `await using` syntax.
	 */
	[Symbol.asyncDispose]: () => Promise<void>;
};
