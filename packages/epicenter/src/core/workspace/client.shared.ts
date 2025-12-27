/**
 * Shared workspace client utilities.
 *
 * This file contains ONLY platform-agnostic utilities used by both Node and browser.
 * Platform-specific types and initialization are in client.browser.ts and client.node.ts.
 */

import { type Action, type Actions, walkActions } from '../actions';

/**
 * Base workspace client shape for iterActions compatibility.
 * Platform-specific clients extend this with additional properties.
 */
type BaseWorkspaceClient = Actions & {
	$ydoc: unknown;
	$tables: unknown;
	$providers: unknown;
	destroy: () => Promise<void>;
	[Symbol.asyncDispose]: () => Promise<void>;
};

/**
 * Base Epicenter client shape for iterActions compatibility.
 */
type BaseEpicenterClient = {
	destroy: () => Promise<void>;
	[Symbol.asyncDispose]: () => Promise<void>;
	[workspaceId: string]: BaseWorkspaceClient | (() => Promise<void>);
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
