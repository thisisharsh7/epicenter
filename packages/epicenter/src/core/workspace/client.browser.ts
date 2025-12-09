/**
 * Browser-specific workspace client entry point.
 *
 * In browser environments, storageDir and epicenterDir are always undefined
 * since filesystem operations are not available.
 */

import type { WorkspaceExports } from '../actions';
import type { WorkspaceIndexMap } from '../indexes';
import type { WorkspaceSchema } from '../schema';
import type { WorkspaceClient } from './client.shared';
import { initializeWorkspaces } from './client.shared';
import type { AnyWorkspaceConfig, WorkspaceConfig } from './config';

export type { WorkspaceClient, WorkspacesToClients } from './client.shared';

/**
 * Creates a workspace client by initializing the workspace and its dependencies.
 *
 * This collects the workspace plus its dependencies, calls `initializeWorkspaces()` to create
 * the full object of clients (`{ workspaceA: clientA, workspaceB: clientB, ... }`), then
 * returns only the specified workspace's client. All dependencies are initialized but not exposed.
 *
 * In browser environments, storageDir is always undefined (no filesystem access).
 */
export async function createWorkspaceClient<
	const TDeps extends readonly AnyWorkspaceConfig[],
	const TId extends string,
	TWorkspaceSchema extends WorkspaceSchema,
	const TIndexResults extends WorkspaceIndexMap,
	TExports extends WorkspaceExports,
>(
	workspace: WorkspaceConfig<
		TDeps,
		TId,
		TWorkspaceSchema,
		TIndexResults,
		TExports
	>,
): Promise<WorkspaceClient<TExports>> {
	// Collect all workspace configs (target + dependencies) for flat/hoisted initialization
	const allWorkspaceConfigs: WorkspaceConfig[] = [];

	if (workspace.dependencies) {
		allWorkspaceConfigs.push(
			...(workspace.dependencies as unknown as WorkspaceConfig[]),
		);
	}

	allWorkspaceConfigs.push(workspace as unknown as WorkspaceConfig);

	// Browser: no storage directory resolution
	const clients = await initializeWorkspaces(
		allWorkspaceConfigs,
		undefined, // storageDir is always undefined in browser
		undefined, // epicenterDir is always undefined in browser
	);

	const workspaceClient = clients[workspace.id as keyof typeof clients];
	if (!workspaceClient) {
		throw new Error(
			`Internal error: workspace "${workspace.id}" was not initialized`,
		);
	}

	return workspaceClient as WorkspaceClient<TExports>;
}
