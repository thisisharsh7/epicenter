/**
 * Node.js-specific epicenter client entry point.
 *
 * In Node.js environments, storageDir is resolved to an absolute path
 * using node:path. This enables filesystem-based persistence.
 */

import path from 'node:path';
import { type Action, type WorkspaceExports, walkActions } from '../actions';
import type { EpicenterDir, StorageDir } from '../types';
import type { AnyWorkspaceConfig } from '../workspace';
import {
	initializeWorkspaces,
	type WorkspaceClient,
	type WorkspacesToClients,
} from '../workspace/client.node';
import type { EpicenterConfig } from './config.node';

// ═══════════════════════════════════════════════════════════════════════════════
// NODE-SPECIFIC TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Node.js-specific Epicenter client type.
 *
 * Maps workspace ids to their clients (which do NOT have `whenSynced`).
 * In Node.js, provider initialization is fully awaited, so no deferred sync is needed.
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
 * In Node.js environments, storageDir is resolved to an absolute path.
 *
 * @param config - Epicenter configuration with workspaces to initialize
 * @returns Initialized epicenter client with access to all workspace exports
 *
 * @example
 * ```typescript
 * // Scoped usage with automatic cleanup (scripts, tests, CLI commands)
 * {
 *   await using client = await createEpicenterClient(epicenter);
 *
 *   // Access workspace actions by workspace id
 *   const page = await client.pages.createPage({
 *     title: 'My First Post',
 *     content: 'Hello, world!',
 *     type: 'blog',
 *     tags: 'tech',
 *   });
 *
 *   await client.contentHub.createYouTubePost({
 *     pageId: page.id,
 *     title: 'Check out my blog post!',
 *     description: 'A great post about...',
 *     niche: ['Coding', 'Productivity'],
 *   });
 *   // Automatic cleanup when scope exits
 * }
 *
 * // Long-lived usage (servers, desktop apps) with manual cleanup
 * const client = await createEpicenterClient(epicenter);
 * // ... use client for app lifetime ...
 * process.on('SIGTERM', async () => {
 *   await client.destroy();
 * });
 * ```
 */
export async function createEpicenterClient<
	const TId extends string,
	const TWorkspaces extends readonly AnyWorkspaceConfig[],
>(
	config: EpicenterConfig<TId, TWorkspaces>,
): Promise<EpicenterClient<TWorkspaces>> {
	// Node.js: resolve storage directory and epicenter directory
	const storageDir = path.resolve(
		config.storageDir ?? process.cwd(),
	) as StorageDir;
	const epicenterDir = path.join(storageDir, '.epicenter') as EpicenterDir;

	// Initialize workspaces using flat/hoisted resolution model
	// All transitive dependencies must be explicitly listed in config.workspaces
	// initializeWorkspaces will validate this and throw if dependencies are missing
	const clients = await initializeWorkspaces(config.workspaces, {
		storageDir,
		epicenterDir,
	});

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
		// Note: Node.js WorkspaceClient does NOT have whenSynced
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
