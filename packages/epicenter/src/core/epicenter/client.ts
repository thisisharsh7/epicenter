import path from 'node:path';
import {
	type Action,
	type WorkspaceExports,
	extractActions,
} from '../actions';
import type { AbsolutePath } from '../types';
import type { AnyWorkspaceConfig, WorkspaceClient } from '../workspace';
import {
	type WorkspacesToClients,
	initializeWorkspaces,
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
		 * Cleanup method for resource management
		 * Destroys all workspaces in this epicenter
		 *
		 * Use with `using` syntax for automatic cleanup:
		 * ```typescript
		 * using client = await createEpicenterClient(config);
		 * ```
		 *
		 * Or call manually for explicit control:
		 * ```typescript
		 * const client = await createEpicenterClient(config);
		 * // ... use client ...
		 * client[Symbol.dispose]();
		 * ```
		 */
		[Symbol.dispose]: () => void;
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
 *   using client = await createEpicenterClient(epicenter);
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
 * process.on('SIGTERM', () => {
 *   client[Symbol.dispose]();
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

	let storageDir: AbsolutePath | undefined = undefined;
	if (isNode) {
		const configuredPath = config.storageDir ?? process.cwd();
		storageDir = path.resolve(configuredPath) as AbsolutePath;
	}

	// Initialize workspaces using flat/hoisted resolution model
	// All transitive dependencies must be explicitly listed in config.workspaces
	// initializeWorkspaces will validate this and throw if dependencies are missing
	const clients = await initializeWorkspaces(config.workspaces, storageDir);

	const cleanup = () => {
		for (const workspaceClient of Object.values(clients)) {
			workspaceClient[Symbol.dispose]();
		}
	};

	return {
		...clients,
		[Symbol.dispose]: cleanup,
	} as EpicenterClient<TWorkspaces>;
}

/**
 * Iterate over all workspace actions in an Epicenter client.
 *
 * Epicenter has a three-layer hierarchy: Client → Workspaces → Actions.
 * This utility traverses all layers and invokes the callback for each action.
 * The Symbol.dispose methods at client and workspace levels are automatically excluded.
 *
 * @param client - The Epicenter client with workspace namespaces
 * @param callback - Function invoked for each action. Receives an object with:
 *   - workspaceId (string): The workspace ID
 *   - actionName (string): The action name
 *   - action (Action): The action object
 *
 * @example
 * ```typescript
 * // Register MCP tools (flat iteration)
 * forEachAction(client, ({ workspaceId, actionName, action }) => {
 *   actions.set(`${workspaceId}_${actionName}`, action);
 * });
 *
 * // Register REST routes (flat iteration)
 * forEachAction(client, ({ workspaceId, actionName, action }) => {
 *   app.get(`/${workspaceId}/${actionName}`, handler);
 * });
 * ```
 */
export function forEachAction<
	TWorkspaces extends readonly AnyWorkspaceConfig[],
>(
	client: EpicenterClient<TWorkspaces>,
	callback: (params: {
		workspaceId: string;
		actionName: string;
		action: Action;
	}) => void,
): void {
	// Extract workspace clients (excluding Symbol.dispose from the client interface)
	const { [Symbol.dispose]: _dispose, ...workspaceClients } = client;

	// Iterate over each workspace and its actions
	for (const [workspaceId, workspaceClient] of Object.entries(
		workspaceClients,
	)) {
		// Extract all exports (excluding Symbol.dispose from the workspace interface)
		const { [Symbol.dispose]: _workspaceDispose, ...workspaceExports } =
			workspaceClient as WorkspaceClient<WorkspaceExports>;

		// Filter to just actions using extractActions helper
		// This ensures utilities and constants are not treated as actions
		const actions = extractActions(workspaceExports);

		// Invoke callback for each action
		for (const [actionName, action] of Object.entries(actions)) {
			callback({
				workspaceId,
				actionName,
				action,
			});
		}
	}
}
