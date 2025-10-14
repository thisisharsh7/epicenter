import type { AnyWorkspaceConfig, WorkspaceConfig } from './workspace';
import { type RuntimeConfig, type WorkspaceClient } from './workspace';
import { initializeWorkspaces } from './workspace/client';

/**
 * Epicenter configuration
 * Defines a collection of workspaces that work together
 *
 * @example
 * ```typescript
 * const epicenter = defineEpicenter({
 *   id: 'my-app',
 *   workspaces: [pages, contentHub, auth],
 * });
 *
 * const client = await createEpicenterClient(epicenter);
 *
 * // Access workspace actions by workspace name
 * await client.pages.createPage({ title: 'Hello' });
 * await client.contentHub.createYouTubePost({ pageId: '1', ... });
 * await client.auth.login({ email: 'user@example.com' });
 * ```
 */
export type EpicenterConfig<
	TId extends string = string,
	TWorkspaces extends readonly AnyWorkspaceConfig[] = readonly AnyWorkspaceConfig[],
> = {
	/**
	 * Unique identifier for this epicenter instance
	 * Used to distinguish between different epicenter configurations
	 *
	 * @example 'my-app', 'content-platform', 'analytics-dashboard'
	 */
	id: TId;

	/**
	 * Array of workspace configurations to compose
	 * Each workspace will be initialized and made available in the client
	 * Workspaces are accessed by their name property
	 *
	 * @example
	 * ```typescript
	 * workspaces: [
	 *   pages,      // name: 'pages'
	 *   contentHub, // name: 'content-hub'
	 *   auth,       // name: 'auth'
	 * ]
	 * ```
	 */
	workspaces: TWorkspaces;
};

/**
 * Define an epicenter configuration
 * Validates and returns the epicenter config
 *
 * @param config - Epicenter configuration
 * @returns Validated epicenter configuration
 *
 * @example
 * ```typescript
 * export const epicenter = defineEpicenter({
 *   id: 'my-app',
 *   workspaces: [pages, contentHub],
 * });
 * ```
 */
export function defineEpicenter<
	const TId extends string,
	const TWorkspaces extends readonly AnyWorkspaceConfig[],
>(config: EpicenterConfig<TId, TWorkspaces>): EpicenterConfig<TId, TWorkspaces> {
	// Validate epicenter ID
	if (!config.id || typeof config.id !== 'string') {
		throw new Error('Epicenter must have a valid string ID');
	}

	// Validate workspaces array
	if (!Array.isArray(config.workspaces)) {
		throw new Error('Workspaces must be an array of workspace configs');
	}

	if (config.workspaces.length === 0) {
		throw new Error('Epicenter must have at least one workspace');
	}

	// Validate each workspace
	for (const workspace of config.workspaces) {
		if (!workspace || typeof workspace !== 'object' || !workspace.id) {
			throw new Error(
				'Invalid workspace: workspaces must be workspace configs with id, version, and name',
			);
		}
	}

	// Check for duplicate workspace names
	const names = config.workspaces.map((ws) => ws.name);
	const uniqueNames = new Set(names);
	if (uniqueNames.size !== names.length) {
		const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
		throw new Error(
			`Duplicate workspace names detected: ${duplicates.join(', ')}. ` +
				`Each workspace must have a unique name.`,
		);
	}

	// Check for duplicate workspace IDs
	const ids = config.workspaces.map((ws) => ws.id);
	const uniqueIds = new Set(ids);
	if (uniqueIds.size !== ids.length) {
		const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
		throw new Error(
			`Duplicate workspace IDs detected: ${duplicates.join(', ')}. ` +
				`Each workspace must have a unique ID.`,
		);
	}

	return config;
}

/**
 * Epicenter client type
 * Maps workspace names to their action handlers
 * Provides typed access to all workspace actions
 */
export type EpicenterClient<TWorkspaces extends readonly AnyWorkspaceConfig[]> = {
	[W in TWorkspaces[number] as W extends WorkspaceConfig<
		infer _Id,
		infer _Version,
		infer TName
	>
		? TName
		: never]: W extends WorkspaceConfig<
		infer _Id,
		infer _Version,
		infer _Name,
		infer _Schema,
		infer _Deps,
		infer _Indexes,
		infer TActionMap
	>
		? WorkspaceClient<TActionMap>
		: never;
} & {
	/**
	 * Cleanup function that destroys all workspaces in this epicenter
	 * Calls destroy() on each workspace client
	 */
	destroy: () => Promise<void>;

	/**
	 * Async dispose for explicit resource management (enables `await using`)
	 * Alias for destroy()
	 */
	[Symbol.asyncDispose]: () => Promise<void>;
};

/**
 * Create an epicenter client with all workspace clients initialized
 * Uses shared initialization logic to ensure workspace instances are properly shared
 *
 * @param config - Epicenter configuration with workspaces to initialize
 * @param runtimeConfig - Optional runtime configuration
 * @returns Initialized epicenter client with access to all workspace actions
 *
 * @example
 * ```typescript
 * // Long-lived usage (web app, desktop app)
 * const client = await createEpicenterClient(epicenter);
 *
 * // Access workspace actions by workspace name
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
 *
 * // Explicit cleanup when done
 * await client.destroy();
 *
 * // Or use explicit resource management (tests, scripts)
 * await using client = await createEpicenterClient(epicenter);
 * // automatically disposed at end of scope
 * ```
 */
export async function createEpicenterClient<
	const TId extends string,
	const TWorkspaces extends readonly AnyWorkspaceConfig[],
>(
	config: EpicenterConfig<TId, TWorkspaces>,
	runtimeConfig: RuntimeConfig = {},
): Promise<EpicenterClient<TWorkspaces>> {
	// Initialize all workspaces using shared initialization logic
	// This ensures workspace instances are properly shared across dependencies
	const clients = initializeWorkspaces(config.workspaces, runtimeConfig);

	// Build the epicenter client object by mapping workspace names to their clients
	const workspaceClients: Record<string, WorkspaceClient<any>> = {};
	for (const workspace of config.workspaces) {
		const client = clients.get(workspace.id);
		if (!client) {
			throw new Error(
				`Internal error: workspace "${workspace.id}" was not initialized`,
			);
		}
		workspaceClients[workspace.name] = client;
	}

	const cleanup = async () => {
		await Promise.all(Array.from(clients.values()).map((client) => client.destroy()));
	};

	return {
		...workspaceClients,
		destroy: cleanup,
		[Symbol.asyncDispose]: cleanup,
	} as EpicenterClient<TWorkspaces>;
}
