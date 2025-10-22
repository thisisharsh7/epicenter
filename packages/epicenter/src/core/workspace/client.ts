import * as Y from 'yjs';
import { createEpicenterDb } from '../../db/core';
import type { WorkspaceActionMap } from '../actions';
import type { WorkspaceIndexMap } from '../indexes';
import type { WorkspaceSchema } from '../schema';
import type {
	AnyWorkspaceConfig,
	WorkspaceConfig,
} from './config';

/**
 * A workspace client is not a standalone concept. It's a single workspace extracted from an Epicenter client.
 *
 * An Epicenter client is an object of workspace clients: `{ workspaceName: WorkspaceClient }`.
 * `createEpicenterClient()` returns the full object. `createWorkspaceClient()` returns one workspace from that object.
 */
export type WorkspaceClient<TActionMap extends WorkspaceActionMap> = TActionMap & {
	/**
	 * Cleanup method for resource management
	 * - Destroys all indexes
	 * - Destroys the YJS document
	 */
	destroy: () => void;
};

/**
 * Maps an array of workspace configs to an object of WorkspaceClients keyed by workspace name.
 *
 * Takes an array of workspace configs and merges them into a single object where:
 * - Each key is a workspace name
 * - Each value is a WorkspaceClient with callable actions and lifecycle management
 *
 * This allows accessing workspace actions as `client.workspaceName.actionName()`.
 *
 * @example
 * ```typescript
 * // Given workspace configs:
 * const authWorkspace = defineWorkspace({ name: 'auth', actions: () => ({ login: ..., logout: ... }) })
 * const storageWorkspace = defineWorkspace({ name: 'storage', actions: () => ({ upload: ..., download: ... }) })
 *
 * // WorkspacesToClients<[typeof authWorkspace, typeof storageWorkspace]> produces:
 * {
 *   auth: WorkspaceClient<{ login: ..., logout: ... }>,
 *   storage: WorkspaceClient<{ upload: ..., download: ... }>
 * }
 * ```
 */
export type WorkspacesToClients<WS extends readonly AnyWorkspaceConfig[]> = {
	[W in WS[number] as W extends { name: infer TName extends string }
		? TName
		: never]: W extends {
		actions: (context: any) => infer TActionMap extends WorkspaceActionMap;
	}
		? WorkspaceClient<TActionMap>
		: never;
};

/**
 * Internal function that initializes multiple workspaces with shared dependency resolution.
 * Uses flat dependency resolution with VS Code-style peer dependency model.
 * All transitive dependencies must be present in the provided workspaces array (flat/hoisted).
 * Initialization uses topological sort for deterministic, predictable order.
 *
 * @param workspaceConfigs - Array of workspace configurations to initialize
 * @returns Object mapping workspace names to initialized workspace clients
 */
export async function initializeWorkspaces<
	const TConfigs extends readonly AnyWorkspaceConfig[],
>(workspaceConfigs: TConfigs): Promise<WorkspacesToClients<TConfigs>> {
	// ═══════════════════════════════════════════════════════════════════════════
	// PHASE 1: REGISTRATION
	// Register all workspace configs with version resolution
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Registry mapping workspace ID to the highest version of that workspace's config.
	 * When the same workspace appears multiple times with different versions,
	 * we keep only the highest version (version compared as integers).
	 * Example: If both workspaceA v1 and workspaceA v3 are registered, we keep v3.
	 */
	const workspaceConfigsMap = new Map<
		string,
		WorkspaceConfig
	>();

	// Register all workspace configs with automatic version resolution
	// If the same workspace ID appears multiple times, keep the highest version
	for (const workspaceConfig of workspaceConfigs) {
		// At runtime, all workspace configs have full WorkspaceConfig properties
		// The AnyWorkspaceConfig constraint is only for type inference
		const config = workspaceConfig as unknown as WorkspaceConfig;
		const existing = workspaceConfigsMap.get(config.id);
		if (!existing || config.version > existing.version) {
			// Either first time seeing this workspace, or this version is higher
			workspaceConfigsMap.set(config.id, config);
		}
		// Otherwise keep existing (higher or equal version)
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
						`Missing dependency: workspace "${workspaceId}" depends on "${dep.id}", ` +
							`but it was not found in rootWorkspaceConfigs.\n\n` +
							`Fix: Add "${dep.id}" to rootWorkspaceConfigs array (flat/hoisted resolution).\n` +
							`All transitive dependencies must be declared at the root level.`,
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
				dependents.get(dep.id)!.push(id);

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
	 * 2. Creates YDoc, DB, indexes, and actions
	 * 3. Returns the initialized workspace client
	 */
	const initializeWorkspace = async (
		workspaceConfig: WorkspaceConfig,
	): Promise<WorkspaceClient<any>> => {
		// Build the workspaceClients object by injecting already-initialized dependencies
		// Key: dependency name, Value: initialized client
		const workspaceClients: Record<string, WorkspaceClient<WorkspaceActionMap>> = {};

		if (
			workspaceConfig.dependencies &&
			workspaceConfig.dependencies.length > 0
		) {
			// Resolve dependencies from the registered configs (handles version resolution)
			// Build set of unique dependency IDs
			const uniqueDepIds = new Set(
				workspaceConfig.dependencies.map((dep) => dep.id),
			);

			// Inject dependency clients using resolved configs
			const depNames = new Set<string>();
			for (const depId of uniqueDepIds) {
				// Get the resolved config (might be a different version than originally specified)
				const resolvedConfig = workspaceConfigsMap.get(depId);
				if (!resolvedConfig) {
					throw new Error(
						`Internal error: dependency "${depId}" not found in registered configs`,
					);
				}

				// Check for duplicate names after version resolution
				if (depNames.has(resolvedConfig.name)) {
					throw new Error(
						`Duplicate dependency names detected in workspace "${workspaceConfig.id}": ` +
							`multiple dependencies resolve to name "${resolvedConfig.name}". ` +
							`Each dependency must have a unique name.`,
					);
				}
				depNames.add(resolvedConfig.name);

				// Get the initialized client
				const depClient = clients.get(depId);
				if (!depClient) {
					throw new Error(
						`Internal error: dependency "${depId}" should have been initialized before "${workspaceConfig.id}"`,
					);
				}

				// Inject using the resolved config's name
				workspaceClients[resolvedConfig.name] = depClient;
			}
		}

		// Now that all dependencies are ready, initialize this workspace's core components

		// Create YJS document with workspace ID as the document GUID
		const ydoc = new Y.Doc({ guid: workspaceConfig.id });

		// Set up YDoc synchronization and persistence (if user provided a setupYDoc function)
		// IMPORTANT: This must run BEFORE createEpicenterDb so that persisted data is loaded
		// into the YDoc before table initialization
		workspaceConfig.setupYDoc?.(ydoc);

		// Initialize Epicenter database (wraps YJS with table/record API)
		const db = createEpicenterDb(ydoc, workspaceConfig.schema);

		// Get index definitions from workspace config by calling the indexes callback
		// Support both sync and async indexes functions
		const indexes = await workspaceConfig.indexes({ db });

		// Validate no duplicate index IDs (keys of returned object)
		const indexIds = Object.keys(indexes);
		if (new Set(indexIds).size !== indexIds.length) {
			throw new Error('Duplicate index IDs detected');
		}

		// Call the actions factory to get action definitions, passing:
		// - workspaceClients: initialized dependency clients (keyed by dep.name)
		// - db: Epicenter database API
		// - indexes: exported resources from each index (db, queries, etc.)
		const actionMap = workspaceConfig.actions({
			workspaces: workspaceClients,
			db,
			indexes,
		});

		// Create cleanup function
		const cleanup = () => {
			// Clean up indexes first
			for (const index of Object.values(indexes)) {
				index.destroy?.();
			}

			// Clean up YDoc (disconnects providers, cleans up observers)
			ydoc.destroy();
		};

		// Create the workspace client with callable actions
		// Actions are already callable, no extraction needed
		const client: WorkspaceClient<any> = {
			...actionMap,
			destroy: cleanup,
		};

		return client;
	};

	// Initialize all workspaces in topological order
	for (const workspaceId of sorted) {
		const workspaceConfig = workspaceConfigsMap.get(workspaceId)!;
		const client = await initializeWorkspace(workspaceConfig);
		clients.set(workspaceId, client);
	}

	// Convert Map to typed object keyed by workspace name (not id)
	const initializedWorkspaces: Record<string, WorkspaceClient<WorkspaceActionMap>> = {};
	for (const [workspaceId, client] of clients) {
		const workspaceConfig = workspaceConfigsMap.get(workspaceId)!;
		initializedWorkspaces[workspaceConfig.name] = client;
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
 * Contrast with `createEpicenterClient()` which returns the full object of all workspace clients.
 */
export async function createWorkspaceClient<
	const TDeps extends readonly AnyWorkspaceConfig[],
	const TId extends string,
	const TVersion extends number,
	TWorkspaceSchema extends WorkspaceSchema,
	const TIndexMap extends WorkspaceIndexMap,
	TActionMap extends WorkspaceActionMap,
>(
	workspace: WorkspaceConfig<
		TDeps,
		TId,
		TVersion,
		string,
		TWorkspaceSchema,
		TIndexMap,
		TActionMap
	>,
): Promise<WorkspaceClient<TActionMap>> {
	// Collect all workspace configs (target + dependencies) for flat/hoisted initialization
	const allWorkspaceConfigs: WorkspaceConfig[] = [];

	// Add all dependencies first
	if (workspace.dependencies) {
		// Dependencies are constrained to AnyWorkspaceConfig at the type level to prevent
		// infinite recursion, but at runtime they're full WorkspaceConfig objects
		allWorkspaceConfigs.push(...(workspace.dependencies as unknown as WorkspaceConfig[]));
	}

	// Add target workspace last
	// This cast is safe because WorkspaceConfig<...generics...> is structurally compatible
	// with WorkspaceConfig (the type with default generics). We use unknown as intermediate
	// to satisfy TypeScript's strict checking while maintaining runtime safety.
	allWorkspaceConfigs.push(workspace as unknown as WorkspaceConfig);

	// Use the shared initialization logic with flat dependency array
	// This initializes ALL workspaces and returns an object keyed by workspace name
	const clients = await initializeWorkspaces(allWorkspaceConfigs);

	// Return the specified workspace's client from the initialized workspaces object
	const workspaceClient = clients[workspace.name as keyof typeof clients];
	if (!workspaceClient) {
		throw new Error(
			`Internal error: workspace "${workspace.name}" was not initialized`,
		);
	}

	// Type assertion is safe because we know the workspace was initialized with the correct action map
	return workspaceClient as WorkspaceClient<TActionMap>;
}
