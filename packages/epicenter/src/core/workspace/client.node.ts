/**
 * Node.js-specific workspace client entry point.
 *
 * In Node.js environments, storageDir is resolved to an absolute path
 * using node:path. This enables filesystem-based persistence and indexes.
 */

import path from 'node:path';
import type { WorkspaceExports } from '../actions';
import type { WorkspaceProviderMap } from '../provider';
import type { WorkspaceSchema } from '../schema';
import type { EpicenterDir, StorageDir } from '../types';
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
 * **Note**: storageDir defaults to process.cwd(). For custom storage paths, wrap the workspace
 * in an epicenter config with defineEpicenter({ storageDir, workspaces: [workspace] }) and use
 * createEpicenterClient() instead.
 */
export async function createWorkspaceClient<
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
): Promise<WorkspaceClient<TExports>> {
	// Collect all workspace configs (target + dependencies) for flat/hoisted initialization
	const allWorkspaceConfigs: WorkspaceConfig[] = [];

	if (workspace.dependencies) {
		allWorkspaceConfigs.push(
			...(workspace.dependencies as unknown as WorkspaceConfig[]),
		);
	}

	allWorkspaceConfigs.push(workspace as unknown as WorkspaceConfig);

	// Node.js: resolve storage directory and epicenter directory
	const resolvedStorageDir = path.resolve(process.cwd()) as StorageDir;
	const resolvedEpicenterDir = path.join(
		resolvedStorageDir,
		'.epicenter',
	) as EpicenterDir;

	const clients = await initializeWorkspaces(
		allWorkspaceConfigs,
		resolvedStorageDir,
		resolvedEpicenterDir,
	);

	const workspaceClient = clients[workspace.id as keyof typeof clients];
	if (!workspaceClient) {
		throw new Error(
			`Internal error: workspace "${workspace.id}" was not initialized`,
		);
	}

	return workspaceClient as WorkspaceClient<TExports>;
}
