/**
 * Node.js workspace client implementation.
 *
 * Provides createClient for Node.js environments (CLI, scripts, servers).
 * Handles storage directory resolution and supports both single-workspace
 * and multi-workspace initialization via function overloading.
 */
import path from 'node:path';
import type { WorkspaceExports } from '../actions';
import type { WorkspaceProviderMap } from '../provider';
import type { WorkspaceSchema } from '../schema';
import type { ProjectDir } from '../types';
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
 * Options for creating a client in Node.js environments.
 */
export type CreateClientOptions = {
	/**
	 * Project root directory for all Epicenter storage.
	 *
	 * This is where:
	 * - `.epicenter/` folder is created for internal data (databases, YJS files)
	 * - Markdown vaults and user content are resolved relative to
	 *
	 * Defaults to `process.cwd()` in Node.js.
	 *
	 * @example
	 * ```typescript
	 * // Store everything in /data/myproject
	 * const client = await createClient(workspaces, {
	 *   projectDir: '/data/myproject',
	 * });
	 *
	 * // Use environment variable
	 * const client = await createClient(workspaces, {
	 *   projectDir: process.env.EPICENTER_PROJECT_DIR,
	 * });
	 * ```
	 */
	projectDir?: string;
};

/**
 * Create a client for a single workspace.
 * Initializes the workspace and its dependencies, returns only the target workspace's client.
 *
 * In Node.js environments, projectDir is resolved to an absolute path.
 *
 * @param workspace - Workspace configuration to initialize
 * @param options - Optional client options including projectDir
 * @returns Initialized workspace client with access to all workspace exports
 *
 * @example
 * ```typescript
 * // Scoped usage with automatic cleanup (scripts, tests, CLI commands)
 * {
 *   await using client = await createClient(blogWorkspace);
 *
 *   const page = await client.createPage({
 *     title: 'My First Post',
 *     content: 'Hello, world!',
 *   });
 *   // Automatic cleanup when scope exits
 * }
 *
 * // Long-lived usage (servers, desktop apps) with manual cleanup
 * const client = await createClient(blogWorkspace);
 * // ... use client for app lifetime ...
 * process.on('SIGTERM', async () => {
 *   await client.destroy();
 * });
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
	options?: CreateClientOptions,
): Promise<WorkspaceClient<TExports>>;

/**
 * Create a client for multiple workspaces.
 * Initializes all workspaces in dependency order, returns an object mapping workspace IDs to clients.
 *
 * Uses flat/hoisted dependency resolution: all transitive dependencies must be
 * explicitly listed in the workspaces array.
 *
 * @param workspaces - Array of workspace configurations to initialize.
 *   Each workspace will be initialized and made available in the returned client.
 *   Workspaces are accessed by their `id` property:
 *   ```typescript
 *   const workspaces = [
 *     pagesWorkspace,      // id: 'pages'
 *     contentHubWorkspace, // id: 'content-hub'
 *     authWorkspace,       // id: 'auth'
 *   ];
 *   const client = await createClient(workspaces);
 *   client.pages.createPage(...);
 *   client['content-hub'].createPost(...);
 *   client.auth.login(...);
 *   ```
 * @param options - Optional client options including projectDir
 * @returns Initialized client with access to all workspace exports by workspace ID
 *
 * @example
 * ```typescript
 * await using client = await createClient([blogWorkspace, authWorkspace]);
 *
 * // Access workspace actions by workspace id
 * await client.blog.createPost({ title: 'Hello' });
 * await client.auth.login({ email: 'user@example.com' });
 * ```
 */
export async function createClient<
	const TConfigs extends readonly AnyWorkspaceConfig[],
>(
	workspaces: TConfigs,
	options?: CreateClientOptions,
): Promise<EpicenterClient<TConfigs>>;

export async function createClient(
	input: AnyWorkspaceConfig | readonly AnyWorkspaceConfig[],
	options?: CreateClientOptions,
): Promise<WorkspaceClient<any> | EpicenterClient<any>> {
	const projectDir = path.resolve(
		options?.projectDir ?? process.cwd(),
	) as ProjectDir;

	if (Array.isArray(input)) {
		validateWorkspaces(input);

		const clients = await initializeWorkspaces(input, projectDir);

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

	const clients = await initializeWorkspaces(allWorkspaceConfigs, projectDir);

	const workspaceClient = clients[workspace.id as keyof typeof clients];
	if (!workspaceClient) {
		throw new Error(
			`Internal error: workspace "${workspace.id}" was not initialized`,
		);
	}

	return workspaceClient as WorkspaceClient<any>;
}
