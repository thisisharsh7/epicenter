/**
 * Node.js workspace client implementation.
 *
 * Provides createClient for Node.js environments (CLI, scripts, servers).
 * Handles storage directory resolution and supports both single-workspace
 * and multi-workspace initialization via function overloading.
 */
import path from 'node:path';
import * as Y from 'yjs';
import { type WorkspaceActionMap, type WorkspaceExports } from '../actions';
import { createEpicenterDb } from '../db/core';
import { buildProviderPaths, getEpicenterDir } from '../paths';
import type { ProviderExports, WorkspaceProviderMap } from '../provider';
import { createWorkspaceValidators, type WorkspaceSchema } from '../schema';
import type { ProjectDir, ProviderPaths } from '../types';
import type {
	AnyWorkspaceConfig,
	WorkspaceConfig,
	WorkspacePaths,
} from './config';

/**
 * A workspace client contains all workspace exports plus lifecycle management.
 * Actions (queries and mutations) are identified at runtime via type guards for API/MCP mapping.
 */
export type WorkspaceClient<TExports extends WorkspaceExports> = TExports & {
	/**
	 * The underlying YJS document for this workspace.
	 *
	 * Exposed for sync providers and advanced use cases.
	 * The document's guid matches the workspace ID.
	 */
	$ydoc: Y.Doc;

	/**
	 * Async cleanup method for resource management.
	 */
	destroy: () => Promise<void>;

	/**
	 * Async disposal for `await using` syntax.
	 */
	[Symbol.asyncDispose]: () => Promise<void>;
};

/**
 * Maps an array of workspace configs to an object of WorkspaceClients keyed by workspace id.
 */
export type WorkspacesToClients<WS extends readonly AnyWorkspaceConfig[]> = {
	[W in WS[number] as W extends { id: infer TId extends string }
		? TId
		: never]: W extends {
		exports: (context: any) => infer TExports extends WorkspaceExports;
	}
		? WorkspaceClient<TExports>
		: never;
};

/**
 * Client for multiple workspaces. Maps workspace IDs to their clients.
 * Returned by `createClient([...workspaces])`.
 */
export type EpicenterClient<TWorkspaces extends readonly AnyWorkspaceConfig[]> =
	WorkspacesToClients<TWorkspaces> & {
		/**
		 * Async cleanup method for resource management.
		 */
		destroy: () => Promise<void>;

		/**
		 * Async disposal for `await using` syntax.
		 */
		[Symbol.asyncDispose]: () => Promise<void>;
	};

/**
 * Validates workspace array configuration.
 */
function validateWorkspaces(workspaces: readonly AnyWorkspaceConfig[]): void {
	if (!Array.isArray(workspaces)) {
		throw new Error('Workspaces must be an array of workspace configs');
	}

	if (workspaces.length === 0) {
		throw new Error('Must have at least one workspace');
	}

	for (const workspace of workspaces) {
		if (!workspace || typeof workspace !== 'object' || !workspace.id) {
			throw new Error(
				'Invalid workspace: workspaces must be workspace configs with id, schema, indexes, and actions',
			);
		}
	}

	const ids = workspaces.map((ws) => ws.id);
	const uniqueIds = new Set(ids);
	if (uniqueIds.size !== ids.length) {
		const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
		throw new Error(
			`Duplicate workspace IDs detected: ${duplicates.join(', ')}. ` +
				`Each workspace must have a unique ID.`,
		);
	}
}

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
 * Create a client for multiple workspaces (Node.js, ASYNCHRONOUS).
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

/**
 * Internal function that initializes multiple workspaces with shared dependency resolution.
 * Uses flat dependency resolution with VS Code-style peer dependency model.
 * All transitive dependencies must be present in the provided workspaces array (flat/hoisted).
 * Initialization uses topological sort for deterministic, predictable order.
 *
 * @param workspaceConfigs - Array of workspace configurations to initialize
 * @param projectDir - Absolute project directory path (Node.js) or undefined (browser)
 * @returns Object mapping workspace ids to initialized workspace clients
 */
async function initializeWorkspaces<
	const TConfigs extends readonly AnyWorkspaceConfig[],
>(
	workspaceConfigs: TConfigs,
	projectDir: ProjectDir | undefined,
): Promise<WorkspacesToClients<TConfigs>> {
	// ═══════════════════════════════════════════════════════════════════════════
	// PHASE 1: REGISTRATION
	// Register all workspace configs
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Registry mapping workspace ID to workspace config.
	 * Each workspace ID should appear at most once in the workspaceConfigs array.
	 */
	const workspaceConfigsMap = new Map<string, WorkspaceConfig>();

	// Register all workspace configs
	for (const workspaceConfig of workspaceConfigs) {
		// At runtime, all workspace configs have full WorkspaceConfig properties
		// The AnyWorkspaceConfig constraint is only for type inference
		const config = workspaceConfig as unknown as WorkspaceConfig;
		const existing = workspaceConfigsMap.get(config.id);
		if (existing) {
			throw new Error(
				`Duplicate workspace ID detected: "${config.id}". Each workspace must have a unique ID.`,
			);
		}
		workspaceConfigsMap.set(config.id, config);
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// PHASE 2: DEPENDENCY VERIFICATION
	// Verify that all dependencies exist in registered workspaces (flat/hoisted model)
	// ═══════════════════════════════════════════════════════════════════════════

	// Verify all dependencies for ALL registered workspace configs (not just root-level ones)
	// This ensures the flat/hoisted model is correctly followed at every level:
	// - If A depends on B and B depends on C, both B and C must be in rootWorkspaceConfigs
	// - By checking every workspace in the map, we verify the entire dependency tree
	//
	// Note: We only check direct dependencies (not recursive) because the flat/hoisted model
	// guarantees complete validation in a single pass. Example:
	// - Root config contains: [A, B, C]
	// - A.dependencies = [B]
	// - B.dependencies = [C]
	// - C.dependencies = []
	// Since each dependent workspace also has their transitive dependencies hoisted to the root,
	// we don't need recursion. Each workspace's direct dependencies are sufficient.
	// When we iterate:
	// - Check A: verify B exists ✓
	// - Check B: verify C exists ✓
	// - Check C: no dependencies ✓
	for (const [workspaceId, workspaceConfig] of workspaceConfigsMap) {
		if (workspaceConfig.dependencies) {
			for (const dep of workspaceConfig.dependencies) {
				// Verify the dependency exists in registered configs (flat/hoisted model)
				if (!workspaceConfigsMap.has(dep.id)) {
					throw new Error(
						`Missing dependency: workspace "${workspaceId}" depends on "${dep.id}", but it was not found in rootWorkspaceConfigs.\n\nFix: Add "${dep.id}" to rootWorkspaceConfigs array (flat/hoisted resolution).\nAll transitive dependencies must be declared at the root level.`,
					);
				}
			}
		}
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// PHASE 3: BUILD DEPENDENCY GRAPH
	// Create adjacency list and in-degree map for topological sort
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Adjacency list mapping workspace ID to dependent workspace IDs.
	 * Example: If workspace B depends on workspace A, then dependents[A] contains [B]
	 * This represents the "outgoing edges" in the dependency graph.
	 */
	const dependents = new Map<string, string[]>();

	/**
	 * In-degree map tracking the number of dependencies for each workspace.
	 * In-degree is the count of "incoming edges" (dependencies).
	 * Example: If workspace C depends on A and B, then inDegree[C] = 2
	 * Workspaces with in-degree 0 have no dependencies and can be initialized first.
	 */
	const inDegree = new Map<string, number>();

	// Initialize structures for all registered workspaces
	for (const id of workspaceConfigsMap.keys()) {
		dependents.set(id, []);
		inDegree.set(id, 0);
	}

	// Build the graph by processing each workspace config's dependencies
	for (const [id, workspaceConfig] of workspaceConfigsMap) {
		if (
			workspaceConfig.dependencies &&
			workspaceConfig.dependencies.length > 0
		) {
			for (const dep of workspaceConfig.dependencies) {
				// Add edge: dep.id -> id (id depends on dep.id)
				// Dependencies already verified in Phase 2
				dependents.get(dep.id)?.push(id);

				// Increment in-degree for the dependent workspace
				inDegree.set(id, inDegree.get(id)! + 1);
			}
		}
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// PHASE 4: TOPOLOGICAL SORT (Kahn's Algorithm)
	// Sort workspaces by dependency order
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Queue of workspace IDs ready to be added to the sorted list.
	 * Starts with all workspaces that have zero dependencies (in-degree = 0).
	 * As we process each workspace, we add new workspaces whose dependencies are satisfied.
	 */
	const queue: string[] = [];
	for (const [id, degree] of inDegree) {
		if (degree === 0) {
			queue.push(id);
		}
	}

	/**
	 * Sorted list of workspace IDs in topological order.
	 * This is the initialization order: dependencies come before their dependents.
	 * Example: If B depends on A, then sorted = [A, B] (not [B, A])
	 */
	const sorted: string[] = [];

	// Process the queue
	while (queue.length > 0) {
		const currentId = queue.shift()!;
		sorted.push(currentId);

		// For each workspace that depends on the current workspace
		for (const dependentId of dependents.get(currentId)!) {
			// Decrement in-degree (one dependency satisfied)
			const newDegree = inDegree.get(dependentId)! - 1;
			inDegree.set(dependentId, newDegree);

			// If all dependencies are satisfied, add to queue
			if (newDegree === 0) {
				queue.push(dependentId);
			}
		}
	}

	// Check for circular dependencies
	if (sorted.length !== workspaceConfigsMap.size) {
		const unsorted = Array.from(workspaceConfigsMap.keys()).filter(
			(id) => !sorted.includes(id),
		);
		throw new Error(
			`Circular dependency detected. The following workspaces form a cycle: ${unsorted.join(', ')}`,
		);
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// PHASE 5: INITIALIZE IN TOPOLOGICAL ORDER
	// Initialize workspaces one by one in dependency order
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Map of workspace ID to initialized workspace client.
	 * Each client exposes all workspace exports (actions, utilities, constants).
	 * Populated as we initialize each workspace in topological order.
	 * When initializing workspace B that depends on A, we can safely
	 * inject clients[A] because A was initialized earlier in the sorted order.
	 */
	const clients = new Map<string, WorkspaceClient<any>>();

	/**
	 * Initialize a single workspace (non-recursive).
	 * All dependencies are guaranteed to be already initialized because we're
	 * processing workspaces in topological order. This function:
	 * 1. Injects already-initialized dependency clients
	 * 2. Creates YDoc, tables, providers, and exports
	 * 3. Returns the initialized workspace client
	 */
	const initializeWorkspace = async (
		workspaceConfig: WorkspaceConfig,
	): Promise<WorkspaceClient<any>> => {
		// Build the workspaceClients object by injecting already-initialized dependencies
		// Key: dependency id, Value: full client with all exports (actions + utilities)
		const workspaceClients: Record<
			string,
			WorkspaceClient<WorkspaceExports>
		> = {};

		if (
			workspaceConfig.dependencies &&
			workspaceConfig.dependencies.length > 0
		) {
			// Inject dependency clients from the registered configs
			// Build set of unique dependency IDs
			const uniqueDepIds = new Set(
				workspaceConfig.dependencies.map((dep) => dep.id),
			);

			// Inject dependency clients
			for (const depId of uniqueDepIds) {
				// Get the workspace config
				const depConfig = workspaceConfigsMap.get(depId);
				if (!depConfig) {
					throw new Error(
						`Internal error: dependency "${depId}" not found in registered configs`,
					);
				}

				// Get the initialized client
				const depClient = clients.get(depId);
				if (!depClient) {
					throw new Error(
						`Internal error: dependency "${depId}" should have been initialized before "${workspaceConfig.id}"`,
					);
				}

				// Inject using the config's id
				workspaceClients[depConfig.id] = depClient;
			}
		}

		// Now that all dependencies are ready, initialize this workspace's core components

		// Create YJS document with workspace ID as the document GUID
		const ydoc = new Y.Doc({ guid: workspaceConfig.id });

		// Initialize Epicenter tables (wraps YJS with table/record API)
		const tables = createEpicenterDb(ydoc, workspaceConfig.tables);

		// Create validators for runtime validation and arktype composition
		// Exposed via exports context for use in migration scripts, external validation, etc.
		const validators = createWorkspaceValidators(workspaceConfig.tables);

		// Initialize each provider by calling its factory function with ProviderContext
		// Each provider receives { id, providerId, ydoc, schema, tables, paths }
		// paths.provider is computed per-provider: .epicenter/providers/{providerId}/
		// Initialize all providers in parallel for better performance
		const providers = Object.fromEntries(
			await Promise.all(
				Object.entries(workspaceConfig.providers).map(
					async ([providerId, providerFn]) => {
						const paths: ProviderPaths | undefined = projectDir
							? buildProviderPaths(projectDir, providerId)
							: undefined;

						const result = await providerFn({
							id: workspaceConfig.id,
							providerId,
							ydoc,
							schema: workspaceConfig.tables,
							tables,
							paths,
						});
						// Providers can return void or exports
						return [providerId, result ?? {}];
					},
				),
			),
		) as Record<string, ProviderExports>;

		const workspacePaths: WorkspacePaths | undefined = projectDir
			? {
					project: projectDir,
					epicenter: getEpicenterDir(projectDir),
				}
			: undefined;

		const exports = workspaceConfig.exports({
			tables,
			schema: workspaceConfig.tables,
			validators,
			providers,
			workspaces: workspaceClients,
			blobs: {} as any,
			paths: workspacePaths,
		});

		// Create async cleanup function
		const cleanup = async () => {
			// Clean up providers first, awaiting any async destroy operations
			// Note: destroy is optional for providers
			await Promise.all(
				Object.values(providers).map((provider) => provider.destroy?.()),
			);

			// Clean up YDoc (disconnects providers, cleans up observers)
			ydoc.destroy();
		};

		// Create the workspace client with all exports (actions + utilities)
		// Filtering to just actions happens at the server/MCP level via iterActions()
		const client: WorkspaceClient<any> = {
			...exports,
			$ydoc: ydoc,
			destroy: cleanup,
			[Symbol.asyncDispose]: cleanup,
		};

		return client;
	};

	// Initialize all workspaces in topological order
	for (const workspaceId of sorted) {
		const workspaceConfig = workspaceConfigsMap.get(workspaceId)!;
		const client = await initializeWorkspace(workspaceConfig);
		clients.set(workspaceId, client);
	}

	// Convert Map to typed object keyed by workspace id
	const initializedWorkspaces: Record<
		string,
		WorkspaceClient<WorkspaceActionMap>
	> = {};
	for (const [workspaceId, client] of clients) {
		initializedWorkspaces[workspaceId] = client;
	}

	return initializedWorkspaces as WorkspacesToClients<TConfigs>;
}
