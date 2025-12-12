/**
 * Node.js-specific workspace client entry point.
 *
 * In Node.js environments, storageDir is resolved to an absolute path
 * using node:path. This enables filesystem-based persistence and indexes.
 *
 * The async nature comes from provider initialization - Node providers like
 * desktop persistence and markdown index perform filesystem I/O during setup.
 */

import path from 'node:path';
import * as Y from 'yjs';
import type { WorkspaceActionMap, WorkspaceExports } from '../actions';
import { createEpicenterDb } from '../db/core';
import type { Provider, ProviderExports } from '../provider';
import type { WorkspaceSchema } from '../schema';
import { createWorkspaceValidators } from '../schema';
import type { EpicenterDir, StorageDir } from '../types';
import type { WorkspaceClient, WorkspacesToClients } from './client.shared';
import type { AnyWorkspaceConfig, WorkspaceConfig } from './config';

export type { WorkspaceClient, WorkspacesToClients } from './client.shared';

// ═══════════════════════════════════════════════════════════════════════════════
// ASYNC INITIALIZATION (Node.js)
//
// This is nearly identical to client.browser.ts, with one key difference:
// - Node.js: Providers are called WITH await (async)
// - Browser: Providers are called WITHOUT await (sync)
//
// Node providers like desktop persistence and markdown index perform filesystem
// I/O during initialization, so we must await them. Browser providers handle
// async internally (IndexedDB loads in background) so don't need await.
//
// This duplication is intentional for clarity - you can read this file
// top-to-bottom without jumping between files.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Initializes multiple workspaces ASYNCHRONOUSLY.
 * Node.js version - providers are awaited for filesystem I/O.
 *
 * Uses flat dependency resolution with VS Code-style peer dependency model.
 * All transitive dependencies must be present in the provided workspaces array (flat/hoisted).
 * Initialization uses topological sort for deterministic, predictable order.
 *
 * @param workspaceConfigs - Array of workspace configurations to initialize
 * @param options.storageDir - Absolute storage directory path
 * @param options.epicenterDir - Absolute path to .epicenter directory
 * @returns Object mapping workspace ids to initialized workspace clients
 */
export async function initializeWorkspaces<
	const TConfigs extends readonly AnyWorkspaceConfig[],
>(
	workspaceConfigs: TConfigs,
	{ storageDir, epicenterDir }: { storageDir: StorageDir; epicenterDir: EpicenterDir },
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
				// Note: Dependencies are already verified in Phase 2
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
	// PHASE 5: INITIALIZE IN TOPOLOGICAL ORDER (ASYNC)
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
	 * Initialize a single workspace ASYNCHRONOUSLY (non-recursive).
	 * All dependencies are guaranteed to be already initialized because we're
	 * processing workspaces in topological order. This function:
	 * 1. Injects already-initialized dependency clients
	 * 2. Creates YDoc, tables, providers, and exports
	 * 3. Returns the initialized workspace client
	 *
	 * NOTE: Unlike client.browser.ts, this AWAITS provider factories.
	 * Node providers perform filesystem I/O during initialization.
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

		// ═══════════════════════════════════════════════════════════════════════
		// KEY DIFFERENCE FROM client.browser.ts:
		// We AWAIT provider factories because Node providers like desktop
		// persistence and markdown index perform filesystem I/O during init.
		// Initialize all providers in parallel for better performance.
		// ═══════════════════════════════════════════════════════════════════════
		const providers = Object.fromEntries(
			await Promise.all(
				Object.entries(workspaceConfig.providers).map(
					async ([providerId, providerFn]) => {
						const result = await providerFn({
							id: workspaceConfig.id,
							providerId,
							ydoc,
							schema: workspaceConfig.tables,
							tables,
							storageDir,
							epicenterDir,
						});
						// Providers can return void or exports
						return [providerId, result ?? {}];
					},
				),
			),
		) as Record<string, ProviderExports>;

		// Call the exports factory to get workspace exports (actions + utilities), passing:
		// - tables: Epicenter tables API for direct table operations
		// - schema: The workspace schema (table definitions)
		// - validators: Schema validators for runtime validation and arktype composition
		// - providers: exported resources from each provider (db, queries, etc.)
		// - workspaces: full clients from dependencies (all exports, not filtered!)
		// - storageDir: Absolute storage directory path
		// - epicenterDir: Absolute path to .epicenter directory
		// Note: blobs are commented out until browser-compatible implementation exists
		const exports = workspaceConfig.exports({
			tables,
			schema: workspaceConfig.tables,
			validators,
			providers,
			workspaces: workspaceClients,
			// blobs temporarily disabled for browser compatibility
			blobs: {} as any,
			storageDir,
			epicenterDir,
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

	// Initialize all workspaces in topological order (async)
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
	const TProviders extends Record<string, Provider<TWorkspaceSchema>>,
	TExports extends WorkspaceExports,
>(
	workspace: WorkspaceConfig<TDeps, TId, TWorkspaceSchema, TProviders, TExports>,
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

	const clients = await initializeWorkspaces(allWorkspaceConfigs, {
		storageDir: resolvedStorageDir,
		epicenterDir: resolvedEpicenterDir,
	});

	const workspaceClient = clients[workspace.id as keyof typeof clients];
	if (!workspaceClient) {
		throw new Error(
			`Internal error: workspace "${workspace.id}" was not initialized`,
		);
	}

	return workspaceClient as WorkspaceClient<TExports>;
}
