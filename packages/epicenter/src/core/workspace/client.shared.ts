/**
 * Shared workspace client types and utilities.
 *
 * This file contains platform-agnostic types used by both Node and browser clients.
 * Platform-specific types (e.g., `whenSynced` for browser) and initialization logic
 * remain in client.browser.ts and client.node.ts.
 */

import type * as Y from 'yjs';
import type { Action, Actions } from '../actions';
import type { WorkspaceBlobs } from '../blobs';
import type { Tables } from '../db/core';
import type { WorkspaceProviderMap } from '../provider';
import type { WorkspaceSchema, WorkspaceValidators } from '../schema';
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
	$workspaces: Record<string, Actions>;

	/** Blob storage for binary files, namespaced by table. */
	$blobs: WorkspaceBlobs<TSchema>;

	/** Filesystem paths (undefined in browser environments). */
	$paths: WorkspacePaths | undefined;

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
	action: Action;
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
