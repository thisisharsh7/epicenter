import * as Y from 'yjs';
import { createEpicenterDb } from '../../db/core';
import type { WorkspaceActionMap } from '../actions';
import type { WorkspaceIndexMap } from '../indexes';
import type { WorkspaceSchema } from '../schema';
import type {
	ImmediateDependencyWorkspaceConfig,
	WorkspaceConfig
} from './config';


/**
 * Workspace client instance returned from createWorkspaceClient
 * Contains callable actions and lifecycle management
 */
export type WorkspaceClient<TActionMap extends WorkspaceActionMap> =
	TActionMap & {
		/**
		 * Dispose for explicit resource management (enables `using`)
		 * - Destroys all indexes
		 * - Destroys the YJS document
		 */
		[Symbol.dispose]: () => void;
	};

/**
 * Mapped type that converts array of workspace configs to object of initialized clients.
 * Extracts workspace names and ActionMaps to create fully-typed client object.
 *
 * @example
 * ```typescript
 * // Given configs:
 * const workspaceA = defineWorkspace({ id: 'workspace-a', name: 'workspaceA', actions: { foo: ... } })
 * const workspaceB = defineWorkspace({ id: 'workspace-b', name: 'workspaceB', actions: { bar: ... } })
 *
 * // Returns type:
 * {
 *   workspaceA: WorkspaceClient<{ foo: ... }>,
 *   workspaceB: WorkspaceClient<{ bar: ... }>
 * }
 * ```
 */
export type InitializedWorkspaces<
	TConfigs extends readonly ImmediateDependencyWorkspaceConfig[],
> = {
	[W in TConfigs[number] as W extends { name: infer TName extends string }
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
 * All transitive dependencies must be present in the root workspaces' dependencies (hoisted to root).
 * Initialization uses topological sort for deterministic, predictable order.
 *
 * @param rootWorkspaceConfigs - Array of root workspace configurations to initialize
 * @returns Object mapping workspace names to initialized workspace clients
 */
export function initializeWorkspaces<
	const TConfigs extends readonly ImmediateDependencyWorkspaceConfig[],
>(
	rootWorkspaceConfigs: TConfigs,
): InitializedWorkspaces<TConfigs> {
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
	const workspaceConfigs = new Map<string, ImmediateDependencyWorkspaceConfig>();

	/**
	 * Register a workspace config, automatically resolving version conflicts.
	 * If a workspace with the same ID is already registered, compares versions
	 * and keeps the highest one. Versions are compared as integers.
	 */
	const registerWorkspaceConfig = (
		workspaceConfig: ImmediateDependencyWorkspaceConfig,
	) => {
		const existing = workspaceConfigs.get(workspaceConfig.id);
		if (!existing) {
			workspaceConfigs.set(workspaceConfig.id, workspaceConfig);
		} else {
			// Compare versions as numbers
			if (workspaceConfig.version > existing.version) {
				// New version is higher, replace
				workspaceConfigs.set(workspaceConfig.id, workspaceConfig);
			}
			// Otherwise keep existing (higher or equal version)
		}
	};

	// Register all root workspace configs (flat/hoisted model: all workspaces are in rootWorkspaceConfigs array)
	for (const workspaceConfig of rootWorkspaceConfigs) {
		registerWorkspaceConfig(workspaceConfig);
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// PHASE 2: DEPENDENCY VERIFICATION
	// Verify that all dependencies exist in registered workspaces (flat/hoisted model)
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Verify that a dependency exists in the registered workspace configs.
	 * In the flat/hoisted model, all transitive dependencies must be present in rootWorkspaceConfigs.
	 */
	const verifyDependency = (workspaceId: string, depId: string) => {
		if (!workspaceConfigs.has(depId)) {
			throw new Error(
				`Missing dependency: workspace "${workspaceId}" depends on "${depId}", ` +
					`but it was not found in rootWorkspaceConfigs.\n\n` +
					`Fix: Add "${depId}" to rootWorkspaceConfigs array (flat/hoisted resolution).\n` +
					`All transitive dependencies must be declared at the root level.`,
			);
		}
	};

	// Verify all dependencies for ALL registered workspace configs (not just root-level ones)
	// This ensures the flat/hoisted model is correctly followed at every level:
	// - If A depends on B and B depends on C, both B and C must be in rootWorkspaceConfigs
	// - By checking every workspace in the map, we verify the entire dependency tree
	for (const [workspaceId, workspaceConfig] of workspaceConfigs) {
		if (workspaceConfig.dependencies) {
			for (const dep of workspaceConfig.dependencies) {
				verifyDependency(workspaceId, dep.id);
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
	for (const id of workspaceConfigs.keys()) {
		dependents.set(id, []);
		inDegree.set(id, 0);
	}

	// Build the graph by processing each workspace config's dependencies
	for (const [id, workspaceConfig] of workspaceConfigs) {
		if (workspaceConfig.dependencies && workspaceConfig.dependencies.length > 0) {
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
	if (sorted.length !== workspaceConfigs.size) {
		const unsorted = Array.from(workspaceConfigs.keys()).filter(
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
	const initializeWorkspace = (
		workspaceConfig: ImmediateDependencyWorkspaceConfig,
	): WorkspaceClient<any> => {
		// Build the workspaces object by injecting already-initialized dependencies
		// Key: dependency name, Value: initialized client
		const workspaces: Record<string, any> = {};

		if (workspaceConfig.dependencies && workspaceConfig.dependencies.length > 0) {
			// Resolve dependencies from the registered configs (handles version resolution)
			// Build set of unique dependency IDs
			const uniqueDepIds = new Set(
				workspaceConfig.dependencies.map((dep) => dep.id),
			);

			// Inject dependency clients using resolved configs
			const depNames = new Set<string>();
			for (const depId of uniqueDepIds) {
				// Get the resolved config (might be a different version than originally specified)
				const resolvedConfig = workspaceConfigs.get(depId);
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
				workspaces[resolvedConfig.name] = depClient;
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
		const indexes = workspaceConfig.indexes({ db });

		// Validate no duplicate index IDs (keys of returned object)
		const indexIds = Object.keys(indexes);
		if (new Set(indexIds).size !== indexIds.length) {
			throw new Error('Duplicate index IDs detected');
		}

		// Call the actions factory to get action definitions, passing:
		// - workspaces: initialized dependency clients (keyed by dep.name)
		// - db: Epicenter database API
		// - indexes: exported resources from each index (db, queries, etc.)
		const actionMap = workspaceConfig.actions({
			workspaces,
			db,
			indexes,
		});

		// Create cleanup function
		const cleanup = () => {
			// Clean up indexes first
			for (const index of Object.values(indexes)) {
				index[Symbol.dispose]?.();
			}

			// Clean up YDoc (disconnects providers, cleans up observers)
			ydoc.destroy();
		};

		// Create the workspace client with callable actions
		// Actions are already callable, no extraction needed
		const client: WorkspaceClient<any> = {
			...actionMap,
			[Symbol.dispose]: cleanup,
		};

		return client;
	};

	// Initialize all workspaces in topological order
	for (const workspaceId of sorted) {
		const workspaceConfig = workspaceConfigs.get(workspaceId)!;
		const client = initializeWorkspace(workspaceConfig);
		clients.set(workspaceId, client);
	}

	// Convert Map to typed object keyed by workspace name (not id)
	const initializedWorkspaces = {} as InitializedWorkspaces<TConfigs>;
	for (const [workspaceId, client] of clients) {
		const workspaceConfig = workspaceConfigs.get(workspaceId)!;
		(initializedWorkspaces as any)[workspaceConfig.name] = client;
	}

	return initializedWorkspaces;
}

/**
 * Create a workspace client with YJS-first architecture
 * Uses flat dependency resolution with VS Code-style peer dependency model
 * All transitive dependencies must be present in workspace.dependencies (hoisted to root)
 * Initialization uses topological sort for deterministic, predictable order
 *
 * @param workspace - Workspace configuration to initialize
 * @returns Initialized workspace client
 */
export function createWorkspaceClient<
	const TDeps extends readonly ImmediateDependencyWorkspaceConfig[],
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
): WorkspaceClient<TActionMap> {
	// Collect all workspace configs (root + dependencies) for flat/hoisted initialization
	const allWorkspaceConfigs: ImmediateDependencyWorkspaceConfig[] = [];

	// Add all dependencies first
	if (workspace.dependencies) {
		allWorkspaceConfigs.push(...workspace.dependencies);
	}

	// Add root workspace last
	allWorkspaceConfigs.push(workspace as any);

	// Use the shared initialization logic with flat dependency array
	const clients = initializeWorkspaces(allWorkspaceConfigs);

	// Return the client for the root workspace (access by name, not id)
	const rootClient = clients[workspace.name as keyof typeof clients];
	if (!rootClient) {
		throw new Error(
			`Internal error: root workspace "${workspace.name}" was not initialized`,
		);
	}

	// Type assertion is safe because we know the workspace was initialized with the correct action map
	return rootClient as WorkspaceClient<TActionMap>;
}
