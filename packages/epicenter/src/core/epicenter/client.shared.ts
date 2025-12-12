/**
 * Shared epicenter client types and utilities.
 *
 * Contains platform-agnostic types and utilities for the epicenter client.
 * Platform-specific entry points (client.browser.ts, client.node.ts) provide
 * the createEpicenterClient function with appropriate storage resolution.
 */

import { type Action, type WorkspaceExports, walkActions } from '../actions';
import type { AnyWorkspaceConfig, WorkspaceClient } from '../workspace';
import type { WorkspacesToClients } from '../workspace/client.shared';

/**
 * Epicenter client type
 * Maps workspace ids to their exports
 * Provides typed access to all workspace exports
 */
export type EpicenterClient<TWorkspaces extends readonly AnyWorkspaceConfig[]> =
	WorkspacesToClients<TWorkspaces> & {
		/**
		 * Async cleanup method for resource management
		 * Destroys all workspaces in this epicenter
		 *
		 * Call manually for explicit control:
		 * ```typescript
		 * const client = await createEpicenterClient(config);
		 * // ... use client ...
		 * await client.destroy();
		 * ```
		 */
		destroy: () => Promise<void>;

		/**
		 * Async disposal for `await using` syntax (TC39 Explicit Resource Management)
		 *
		 * Use for automatic cleanup when scope exits:
		 * ```typescript
		 * await using client = await createEpicenterClient(config);
		 * // ... use client ...
		 * // cleanup happens automatically when scope exits
		 * ```
		 */
		[Symbol.asyncDispose]: () => Promise<void>;
	};

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
 * Supports nested exports: actions can be organized in namespaces like
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
export function* iterActions<TWorkspaces extends readonly AnyWorkspaceConfig[]>(
	client: EpicenterClient<TWorkspaces>,
): Generator<ActionInfo> {
	// Extract workspace clients (excluding cleanup methods from the client interface)
	const {
		destroy: _destroy,
		[Symbol.asyncDispose]: _asyncDispose,
		...workspaceClients
	} = client;

	// Iterate over each workspace and its actions
	for (const [workspaceId, workspaceClient] of Object.entries(
		workspaceClients,
	)) {
		// Extract all exports (excluding cleanup methods and internal properties from the workspace interface)
		const {
			destroy: _workspaceDestroy,
			[Symbol.asyncDispose]: _workspaceAsyncDispose,
			$ydoc: _$ydoc,
			...workspaceExports
		} = workspaceClient as WorkspaceClient<WorkspaceExports>;

		// Walk through all actions (including nested namespaces)
		// and yield each one with its full path
		for (const { path, action } of walkActions(workspaceExports)) {
			yield {
				workspaceId,
				actionPath: path,
				action,
			};
		}
	}
}
