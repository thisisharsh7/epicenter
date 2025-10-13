import type { AnyWorkspaceConfig, WorkspaceConfig } from './workspace';
import { createWorkspaceClient, type RuntimeConfig, type WorkspaceClient } from './workspace';

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
};

/**
 * Create an epicenter client with all workspace clients initialized
 * Initializes each workspace independently and composes them into a single client object
 *
 * @param config - Epicenter configuration with workspaces to initialize
 * @param runtimeConfig - Optional runtime configuration
 * @returns Initialized epicenter client with access to all workspace actions
 *
 * @example
 * ```typescript
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
 * // Cleanup when done
 * await client.destroy();
 * ```
 */
export async function createEpicenterClient<
	const TId extends string,
	const TWorkspaces extends readonly AnyWorkspaceConfig[],
>(
	config: EpicenterConfig<TId, TWorkspaces>,
	runtimeConfig: RuntimeConfig = {},
): Promise<EpicenterClient<TWorkspaces>> {
	// Create a composite workspace that has all top-level workspaces as dependencies
	// The runtime's createWorkspaceClient will handle dependency resolution and version management
	// This ensures all workspaces share the same YDoc instances for their dependencies
	let workspacesObject: Record<string, any> | null = null;
	let compositeDestroyFn: (() => Promise<void>) | null = null;

	const compositeWorkspace: AnyWorkspaceConfig = {
		id: `${config.id}-composite`,
		version: '1',
		name: `${config.id}-composite`,
		schema: {},
		dependencies: config.workspaces as any,
		indexes: () => ({}),
		actions: ({ workspaces }) => {
			// Capture the workspaces object so we can access it outside
			workspacesObject = workspaces;
			// Return empty actions
			return {};
		},
	};

	let compositeClient: WorkspaceClient<any>;
	try {
		compositeClient = await createWorkspaceClient(compositeWorkspace, runtimeConfig);
		compositeDestroyFn = compositeClient.destroy;
	} catch (error) {
		throw new Error(
			`Failed to initialize epicenter: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	// workspacesObject should now be populated by the actions function
	if (!workspacesObject) {
		throw new Error('Internal error: workspaces object was not captured');
	}

	// Build the epicenter client object with workspace clients keyed by name
	const epicenterClient: Record<string, any> = {};

	for (const workspace of config.workspaces) {
		const client = workspacesObject[workspace.name];
		if (!client) {
			throw new Error(
				`Internal error: workspace "${workspace.name}" was not found in composite workspace`,
			);
		}
		epicenterClient[workspace.name] = client;
	}

	// Add destroy method that cleans up the composite workspace
	epicenterClient.destroy = async () => {
		if (!compositeDestroyFn) {
			throw new Error('Internal error: composite destroy function not set');
		}
		try {
			await compositeDestroyFn();
		} catch (error) {
			throw new Error(
				`Failed to destroy epicenter: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	};

	return epicenterClient as EpicenterClient<TWorkspaces>;
}
