/**
 * Shared workspace client types and utilities.
 *
 * This file contains platform-agnostic types used by both Node and browser clients.
 * Platform-specific types (e.g., `whenSynced` for browser) and initialization logic
 * remain in client.browser.ts and client.node.ts.
 */

import * as Y from 'yjs';
import { type Action, type Actions, walkActions } from '../actions';
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

/**
 * Base properties for multi-workspace Epicenter clients.
 *
 * Platform-specific files extend this with additional properties
 * (e.g., browser adds `whenSynced` for aggregate sync tracking).
 */
export type EpicenterClientBase = {
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

type AsyncDisposable = {
	destroy: () => Promise<void>;
	[Symbol.asyncDispose]: () => Promise<void>;
};

type BaseWorkspaceClient = Actions &
	AsyncDisposable & {
		$ydoc: object;
		$tables: Record<string, unknown>;
		$providers: Record<string, unknown>;
		$validators: Record<string, unknown>;
		$workspaces: Record<string, unknown>;
		$blobs: Record<string, unknown>;
		$paths: unknown;
	};

/**
 * The index signature must include `() => Promise<void>` because `destroy` is
 * a string-keyed property. TypeScript requires index signatures to be supersets
 * of all explicit string-keyed properties.
 */
type BaseEpicenterClient = AsyncDisposable &
	Record<string, BaseWorkspaceClient | (() => Promise<void>)>;

/** Info about an action collected from the client hierarchy */
export type ActionInfo = {
	workspaceId: string;
	actionPath: string[];
	action: Action;
};

/**
 * Generator that yields all workspace actions in an Epicenter client.
 *
 * Epicenter has a three-layer hierarchy: Client → Workspaces → Actions.
 * This generator traverses all layers (including nested namespaces) and yields
 * each action with its metadata. The destroy and Symbol.asyncDispose methods
 * at client and workspace levels are automatically excluded.
 *
 * Supports nested actions: actions can be organized in namespaces like
 * `{ users: { getAll: defineQuery(...), crud: { create: defineMutation(...) } } }`
 *
 * @param client - The Epicenter client with workspace namespaces
 * @yields Objects containing workspaceId, actionPath, and action
 *
 * @example
 * ```typescript
 * // Map over actions directly (Iterator Helpers)
 * const toolNames = iterActions(client).map(info => info.workspaceId);
 *
 * // Group actions by workspace
 * const byWorkspace = Object.groupBy(
 *   iterActions(client),
 *   info => info.workspaceId
 * );
 *
 * // Iterate with early break
 * for (const { workspaceId, actionPath, action } of iterActions(client)) {
 *   if (action.type === 'mutation') break;
 * }
 * ```
 */
export function* iterActions(
	client: BaseEpicenterClient,
): Generator<ActionInfo> {
	const {
		destroy: _destroy,
		[Symbol.asyncDispose]: _asyncDispose,
		...workspaceClients
	} = client;

	for (const [workspaceId, workspaceClient] of Object.entries(
		workspaceClients,
	)) {
		if (typeof workspaceClient === 'function') continue;

		const {
			destroy: _workspaceDestroy,
			[Symbol.asyncDispose]: _workspaceAsyncDispose,
			$ydoc: _$ydoc,
			$tables: _$tables,
			$providers: _$providers,
			$validators: _$validators,
			$workspaces: _$workspaces,
			$blobs: _$blobs,
			$paths: _$paths,
			...workspaceActions
		} = workspaceClient as BaseWorkspaceClient;

		for (const { path, action } of walkActions(workspaceActions)) {
			yield {
				workspaceId,
				actionPath: path,
				action,
			};
		}
	}
}
