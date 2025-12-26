/**
 * Shared workspace client types and utilities.
 *
 * This file contains platform-agnostic types and the action iteration utilities.
 * Platform-specific initialization logic is in client.browser.ts and client.node.ts.
 */

import * as Y from 'yjs';
import { type Action, type WorkspaceExports, walkActions } from '../actions';
import type { AnyWorkspaceConfig } from './config';

/**
 * Validates workspace array configuration.
 * Throws descriptive errors for invalid configurations.
 *
 * @param workspaces - Array of workspace configs to validate
 * @throws {Error} If configuration is invalid
 */
export function validateWorkspaces(
	workspaces: readonly AnyWorkspaceConfig[],
): void {
	if (!Array.isArray(workspaces)) {
		throw new Error('Workspaces must be an array of workspace configs');
	}

	if (workspaces.length === 0) {
		throw new Error('Must have at least one workspace');
	}

	for (const workspace of workspaces) {
		if (!workspace || typeof workspace !== 'object' || !workspace.id) {
			throw new Error(
				'Invalid workspace: workspaces must be workspace configs with id, schema, indexes, and actions',
			);
		}
	}

	const ids = workspaces.map((ws) => ws.id);
	const uniqueIds = new Set(ids);
	if (uniqueIds.size !== ids.length) {
		const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
		throw new Error(
			`Duplicate workspace IDs detected: ${duplicates.join(', ')}. ` +
				`Each workspace must have a unique ID.`,
		);
	}
}

/**
 * A workspace client contains all workspace exports plus lifecycle management.
 * Actions (queries and mutations) are identified at runtime via type guards for API/MCP mapping.
 */
export type WorkspaceClient<TExports extends WorkspaceExports> = TExports & {
	/**
	 * The underlying YJS document for this workspace.
	 *
	 * Exposed for sync providers and advanced use cases.
	 * The document's guid matches the workspace ID.
	 *
	 * @example
	 * ```typescript
	 * const client = await createClient([blogWorkspace]);
	 * const ydoc = client.blog.$ydoc;
	 * ydoc.on('update', (update) => { ... });
	 * ```
	 */
	$ydoc: Y.Doc;

	/**
	 * Async cleanup method for resource management
	 * - Destroys all providers (awaiting any async cleanup)
	 * - Destroys the YJS document
	 *
	 * Call manually for explicit control:
	 * ```typescript
	 * const client = await createClient(workspace);
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
	 * await using client = await createClient(workspace);
	 * // ... use client ...
	 * // cleanup happens automatically when scope exits
	 * ```
	 */
	[Symbol.asyncDispose]: () => Promise<void>;
};

/**
 * Maps an array of workspace configs to an object of WorkspaceClients keyed by workspace id.
 *
 * Takes an array of workspace configs and merges them into a single object where:
 * - Each key is a workspace id
 * - Each value is a WorkspaceClient with all exports and lifecycle management
 *
 * This allows accessing workspace exports as `client.workspaceId.exportName()`.
 *
 * Note: Workspaces can export actions, utilities, constants, and helpers.
 * Actions (queries/mutations) get special treatment at the server/MCP level via iterActions().
 *
 * @example
 * ```typescript
 * // Given workspace configs:
 * const authWorkspace = defineWorkspace({ id: 'auth', exports: () => ({ login: ..., logout: ..., validateToken: ... }) })
 * const storageWorkspace = defineWorkspace({ id: 'storage', exports: () => ({ upload: ..., download: ..., MAX_FILE_SIZE: ... }) })
 *
 * // WorkspacesToClients<[typeof authWorkspace, typeof storageWorkspace]> produces:
 * {
 *   auth: WorkspaceClient<{ login: ..., logout: ... }>,  // Only actions exposed
 *   storage: WorkspaceClient<{ upload: ..., download: ... }>  // Only actions exposed
 * }
 * ```
 */
export type WorkspacesToClients<WS extends readonly AnyWorkspaceConfig[]> = {
	[W in WS[number] as W extends { id: infer TId extends string }
		? TId
		: never]: W extends {
		exports: (context: any) => infer TExports extends WorkspaceExports;
	}
		? WorkspaceClient<TExports>
		: never;
};

/**
 * Client for multiple workspaces. Maps workspace IDs to their clients.
 * Returned by `createClient([...workspaces])`.
 *
 * @example
 * ```typescript
 * // Access workspace actions by workspace id
 * const page = await client.pages.createPage({
 *   title: 'My First Post',
 *   content: 'Hello, world!',
 *   type: 'blog',
 *   tags: 'tech',
 * });
 *
 * await client.contentHub.createYouTubePost({
 *   pageId: page.id,
 *   title: 'Check out my blog post!',
 *   description: 'A great post about...',
 *   niche: ['Coding', 'Productivity'],
 * });
 * ```
 */
export type EpicenterClient<TWorkspaces extends readonly AnyWorkspaceConfig[]> =
	WorkspacesToClients<TWorkspaces> & {
		/**
		 * Async cleanup method for resource management.
		 * Destroys all workspaces in this client.
		 *
		 * Call manually for explicit control:
		 * ```typescript
		 * const client = await createClient(workspaces);
		 * // ... use client ...
		 * await client.destroy();
		 * ```
		 */
		destroy: () => Promise<void>;

		/**
		 * Async disposal for `await using` syntax (TC39 Explicit Resource Management).
		 *
		 * Use for automatic cleanup when scope exits:
		 * ```typescript
		 * await using client = await createClient(workspaces);
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
