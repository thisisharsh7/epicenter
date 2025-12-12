/**
 * Browser-specific epicenter client entry point.
 *
 * In browser environments, storageDir and epicenterDir are always undefined
 * since filesystem operations are not available.
 *
 * IMPORTANT: Browser initialization is SYNCHRONOUS because browser providers
 * (IndexedDB persistence, WebSocket sync) handle their async operations internally.
 * This enables immediate client usage without await.
 */

import { type Action, type WorkspaceExports, walkActions } from '../actions';
import type { AnyWorkspaceConfig } from '../workspace';
import {
	initializeWorkspaces,
	type WorkspaceClient,
	type WorkspacesToClients,
} from '../workspace/client.browser';
import type { EpicenterConfig } from './config.browser';

// ═══════════════════════════════════════════════════════════════════════════════
// BROWSER-SPECIFIC TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Browser-specific Epicenter client type.
 *
 * Maps workspace ids to their clients (which include `whenSynced`).
 * Provides typed access to all workspace exports with browser-specific features.
 */
export type EpicenterClient<TWorkspaces extends readonly AnyWorkspaceConfig[]> =
	WorkspacesToClients<TWorkspaces> & {
		/** Async cleanup method - destroys all workspaces. */
		destroy: () => Promise<void>;

		/** Async disposal for `await using` syntax. */
		[Symbol.asyncDispose]: () => Promise<void>;
	};

/** Info about an action collected from the client hierarchy */
export type ActionInfo = {
	workspaceId: string;
	actionPath: string[];
	action: Action;
};

/**
 * Create an epicenter client with all workspace clients initialized
 * Uses shared initialization logic to ensure workspace instances are properly shared
 *
 * In browser environments, storageDir is always undefined (no filesystem access).
 *
 * IMPORTANT: This is SYNCHRONOUS in browser - no await needed.
 *
 * @param config - Epicenter configuration with workspaces to initialize
 * @returns Initialized epicenter client with access to all workspace exports
 *
 * @example
 * ```typescript
 * // Browser: synchronous initialization
 * const client = createEpicenterClient(epicenter);
 *
 * // Client is immediately usable
 * const pages = client.pages.getAllPages();
 * ```
 */
export function createEpicenterClient<
	const TId extends string,
	const TWorkspaces extends readonly AnyWorkspaceConfig[],
>(config: EpicenterConfig<TId, TWorkspaces>): EpicenterClient<TWorkspaces> {
	// Browser: sync initialization
	const clients = initializeWorkspaces(config.workspaces);

	const cleanup = async () => {
		await Promise.all(
			// biome-ignore lint/suspicious/noExplicitAny: WorkspacesToClients returns a mapped type that Object.values can't narrow
			Object.values(clients).map((workspaceClient: WorkspaceClient<any>) =>
				workspaceClient.destroy(),
			),
		);
	};

	return {
		...clients,
		destroy: cleanup,
		[Symbol.asyncDispose]: cleanup,
	} as EpicenterClient<TWorkspaces>;
}

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
			whenSynced: _whenSynced,
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
