import path from 'node:path';
import { type Action, type WorkspaceExports, walkActions } from '../actions';
import type { AbsolutePath } from '../types';
import type { AnyWorkspaceConfig, WorkspaceClient } from '../workspace';
import {
	initializeWorkspaces,
	type WorkspacesToClients,
} from '../workspace/client';
import type { EpicenterConfig } from './config';

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

/**
 * Create an epicenter client with all workspace clients initialized
 * Uses shared initialization logic to ensure workspace instances are properly shared
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
	// Resolve storageDir with environment detection
	// In Node.js: resolve to absolute path (defaults to process.cwd() if not specified)
	// In browser: undefined (filesystem operations not available)
	const isNode =
		typeof process !== 'undefined' &&
		process.versions != null &&
		process.versions.node != null;

	let storageDir: AbsolutePath | undefined ;
	if (isNode) {
		const configuredPath = config.storageDir ?? process.cwd();
		storageDir = path.resolve(configuredPath) as AbsolutePath;
	}

	// Initialize workspaces using flat/hoisted resolution model
	// All transitive dependencies must be explicitly listed in config.workspaces
	// initializeWorkspaces will validate this and throw if dependencies are missing
	const clients = await initializeWorkspaces(config.workspaces, storageDir);

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
 * Iterate over all workspace actions in an Epicenter client.
 *
 * Epicenter has a three-layer hierarchy: Client → Workspaces → Actions.
 * This utility traverses all layers (including nested namespaces) and invokes
 * the callback for each action. The destroy and Symbol.asyncDispose methods
 * at client and workspace levels are automatically excluded.
 *
 * Supports nested exports: actions can be organized in namespaces like
 * `{ users: { getAll: defineQuery(...), crud: { create: defineMutation(...) } } }`
 *
 * @param client - The Epicenter client with workspace namespaces
 * @param callback - Function invoked for each action. Receives an object with:
 *   - workspaceId (string): The workspace ID
 *   - actionPath (string[]): The path to the action (e.g., ['users', 'crud', 'create'])
 *   - action (Action): The action object
 *
 * @example
 * ```typescript
 * // Register MCP tools (underscore-joined paths)
 * forEachAction(client, ({ workspaceId, actionPath, action }) => {
 *   const toolName = [workspaceId, ...actionPath].join('_');
 *   actions.set(toolName, action);
 * });
 *
 * // Register REST routes (slash-joined paths)
 * forEachAction(client, ({ workspaceId, actionPath, action }) => {
 *   const routePath = `/${workspaceId}/${actionPath.join('/')}`;
 *   app.get(routePath, handler);
 * });
 * ```
 */
export function forEachAction<
	TWorkspaces extends readonly AnyWorkspaceConfig[],
>(
	client: EpicenterClient<TWorkspaces>,
	callback: (params: {
		workspaceId: string;
		actionPath: string[];
		action: Action;
	}) => void,
): void {
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
		// Extract all exports (excluding cleanup methods from the workspace interface)
		const {
			destroy: _workspaceDestroy,
			[Symbol.asyncDispose]: _workspaceAsyncDispose,
			...workspaceExports
		} = workspaceClient as WorkspaceClient<WorkspaceExports>;

		// Walk through all actions (including nested namespaces)
		// and invoke callback for each one with its full path
		for (const { path, action } of walkActions(workspaceExports)) {
			callback({
				workspaceId,
				actionPath: path,
				action,
			});
		}
	}
}
