/**
 * Browser workspace client implementation.
 *
 * Provides createClient for browser environments (web apps, Tauri).
 * Uses undefined storageDir since browsers use IndexedDB for persistence
 * rather than filesystem paths.
 */
import type { WorkspaceExports } from '../actions';
import type { WorkspaceProviderMap } from '../provider';
import type { WorkspaceSchema } from '../schema';
import {
	type EpicenterClient,
	type WorkspaceClient,
	initializeWorkspaces,
	validateWorkspaces,
} from './client.shared';
import type { AnyWorkspaceConfig, WorkspaceConfig } from './config';

export type {
	EpicenterClient,
	WorkspaceClient,
	WorkspacesToClients,
} from './client.shared';

/**
 * Create a client for a single workspace (browser version).
 * Initializes the workspace and its dependencies, returns only the target workspace's client.
 *
 * In browser environments, storageDir is always undefined (no filesystem access).
 *
 * @param workspace - Workspace configuration to initialize
 * @returns Initialized workspace client with access to all workspace exports
 *
 * @example
 * ```typescript
 * await using client = await createClient(blogWorkspace);
 * const page = await client.createPage({ title: 'Hello' });
 * ```
 */
export async function createClient<
	const TDeps extends readonly AnyWorkspaceConfig[],
	const TId extends string,
	TWorkspaceSchema extends WorkspaceSchema,
	const TProviderResults extends WorkspaceProviderMap,
	TExports extends WorkspaceExports,
>(
	workspace: WorkspaceConfig<
		TDeps,
		TId,
		TWorkspaceSchema,
		TProviderResults,
		TExports
	>,
): Promise<WorkspaceClient<TExports>>;

/**
 * Create a client for multiple workspaces (browser version).
 * Initializes all workspaces in dependency order, returns an object mapping workspace IDs to clients.
 *
 * In browser environments, storageDir is always undefined (no filesystem access).
 *
 * @param workspaces - Array of workspace configurations to initialize
 * @returns Initialized client with access to all workspace exports by workspace ID
 *
 * @example
 * ```typescript
 * await using client = await createClient([blogWorkspace, authWorkspace]);
 * await client.blog.createPost({ title: 'Hello' });
 * ```
 */
export async function createClient<
	const TConfigs extends readonly AnyWorkspaceConfig[],
>(workspaces: TConfigs): Promise<EpicenterClient<TConfigs>>;

export async function createClient(
	input: AnyWorkspaceConfig | readonly AnyWorkspaceConfig[],
): Promise<WorkspaceClient<any> | EpicenterClient<any>> {
	if (Array.isArray(input)) {
		validateWorkspaces(input);

		const clients = await initializeWorkspaces(input, undefined, undefined);

		const cleanup = async () => {
			await Promise.all(
				Object.values(clients).map((workspaceClient: WorkspaceClient<any>) =>
					workspaceClient.destroy(),
				),
			);
		};

		return {
			...clients,
			destroy: cleanup,
			[Symbol.asyncDispose]: cleanup,
		} as EpicenterClient<any>;
	}

	const workspace = input as WorkspaceConfig;
	const allWorkspaceConfigs: WorkspaceConfig[] = [];

	if (workspace.dependencies) {
		allWorkspaceConfigs.push(
			...(workspace.dependencies as unknown as WorkspaceConfig[]),
		);
	}
	allWorkspaceConfigs.push(workspace);

	const clients = await initializeWorkspaces(
		allWorkspaceConfigs,
		undefined,
		undefined,
	);

	const workspaceClient = clients[workspace.id as keyof typeof clients];
	if (!workspaceClient) {
		throw new Error(
			`Internal error: workspace "${workspace.id}" was not initialized`,
		);
	}

	return workspaceClient as WorkspaceClient<any>;
}
