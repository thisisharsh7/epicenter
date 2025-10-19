import type { WorkspaceActionMap } from './actions';
import type { WorkspaceConfig, AnyWorkspaceConfig } from './workspace';
import { type WorkspaceClient } from './workspace';
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
	TWorkspaces extends readonly WorkspaceConfig[] = readonly WorkspaceConfig[],
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
 * Helper type that extracts the name and WorkspaceClient type for a single workspace
 * Returns a single-entry object type: { [name]: WorkspaceClient<TActionMap> }
 */
type WorkspaceToClientEntry<W> = W extends {
	name: infer TName extends string;
	actions: (context: any) => infer TActionMap;
}
	? { [K in TName]: WorkspaceClient<TActionMap> }
	: never;

/**
 * Helper type that recursively processes a tuple of workspaces and merges them into a single object type
 * Distributes over each tuple element and combines all workspace client entries
 */
type WorkspacesToClientObject<WS extends readonly AnyWorkspaceConfig[]> = WS extends readonly [
	infer First,
	...infer Rest extends readonly AnyWorkspaceConfig[],
]
	? WorkspaceToClientEntry<First> & WorkspacesToClientObject<Rest>
	: {};

/**
 * Epicenter client type
 * Maps workspace names to their action handlers
 * Provides typed access to all workspace actions
 */
export type EpicenterClient<TWorkspaces extends readonly AnyWorkspaceConfig[]> =
	WorkspacesToClientObject<TWorkspaces> & {
		/**
		 * Cleanup method for resource management
		 * Destroys all workspaces in this epicenter
		 */
		destroy: () => void;
	};

/**
 * Create an epicenter client with all workspace clients initialized
 * Uses shared initialization logic to ensure workspace instances are properly shared
 *
 * @param config - Epicenter configuration with workspaces to initialize
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
 * client.destroy();
 * ```
 */
export async function createEpicenterClient<
	const TId extends string,
	const TWorkspaces extends readonly WorkspaceConfig[],
>(
	config: EpicenterConfig<TId, TWorkspaces>,
): Promise<EpicenterClient<TWorkspaces>> {
	// Initialize workspaces using flat/hoisted resolution model
	// All transitive dependencies must be explicitly listed in config.workspaces
	// initializeWorkspaces will validate this and throw if dependencies are missing
	const clients = await initializeWorkspaces(config.workspaces);

	const cleanup = () => {
		for (const client of Object.values(clients)) {
			client.destroy();
		}
	};

	return {
		...clients,
		destroy: cleanup,
	} as EpicenterClient<TWorkspaces>;
}
