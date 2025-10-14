import * as Y from 'yjs';
import { createEpicenterDb } from '../../db/core';
import type { WorkspaceActionMap } from '../actions';
import type { WorkspaceSchema } from '../schema';
import type { WorkspaceIndexMap } from '../indexes';
import type {
	WorkspaceConfig,
	AnyWorkspaceConfig,
	ExtractHandlers,
} from './config';

/**
 * Extract handlers from a workspace action map at runtime
 * Converts action objects to their handler functions
 *
 * @param actionMap - Map of action name to action object
 * @returns Map of action name to handler function
 */
export function extractHandlers<T extends WorkspaceActionMap>(
	actionMap: T,
): ExtractHandlers<T> {
	return Object.fromEntries(
		Object.entries(actionMap).map(([actionName, action]) => [
			actionName,
			action.handler,
		]),
	) as ExtractHandlers<T>;
}

/**
 * Runtime configuration provided by the user
 *
 * ## Workspace File Structure
 *
 * Workspaces use a `.epicenter/` folder for all system-managed data:
 *
 * ```
 * workspace-root/
 *   epicenter.config.ts       # Workspace definition
 *
 *   .epicenter/               # System-managed folder (auto-created)
 *     assets/                 # Binary blobs (audio, video, images)
 *                            # Referenced by YJS data, not directly edited by users
 *                            # Example: audio files in a transcription app
 *
 *     indexes/                # Index storage (SQLite DBs, vector DBs, etc.)
 *                            # Synchronized snapshots for querying
 *                            # Can be rebuilt from YJS document
 *
 *     ydoc.bin                # YJS document persistence file
 *                            # Source of truth for all structured data
 *
 *     .gitignore              # Auto-generated, typically ignores:
 *                            # - assets/ (large binaries)
 *                            # - indexes/ (rebuildable)
 *                            # - ydoc.bin (depends on sync strategy)
 * ```
 *
 * ## Assets
 *
 * Binary files (audio, video, images) are stored in `.epicenter/assets/` and referenced
 * by structured data in the YJS document. These are app-managed blobs that users interact
 * with through the application, not directly through the file system.
 *
 * Example: In a transcription app, audio recordings are stored as blobs in `assets/` while
 * the recording metadata (title, date, duration) lives in YJS tables that reference these files
 * by path (e.g., `.epicenter/assets/rec-001.mp3`).
 *
 * ## Indexes
 *
 * Indexes are synchronized snapshots of YJS data optimized for different query patterns.
 * They live in `.epicenter/indexes/` and can be rebuilt from the YJS document, so they
 * are typically gitignored.
 *
 * ## YJS Persistence
 *
 * The `ydoc.bin` file persists the YJS document to disk. This is the source of truth for
 * all structured data in the workspace. Whether to gitignore this depends on your sync
 * strategy (local-only vs. collaborative).
 *
 * ## Future Configuration Options
 *
 * Currently, RuntimeConfig is empty. Future options may include:
 * - YJS persistence strategies (filesystem, IndexedDB, remote sync)
 * - Custom asset storage locations
 * - Index rebuild strategies
 * - Collaboration providers
 */
export type RuntimeConfig = {
	// Empty for now - configuration will be added as needed
};

/**
 * Workspace client instance returned from createWorkspaceClient
 * Contains action handlers and lifecycle management
 */
export type WorkspaceClient<TActionMap extends WorkspaceActionMap> =
	ExtractHandlers<TActionMap> & {
		/**
		 * Cleanup function that destroys this workspace
		 * - Destroys all indexes
		 * - Destroys the YJS document
		 */
		destroy: () => Promise<void>;

		/**
		 * Async dispose for explicit resource management (enables `await using`)
		 * Alias for destroy()
		 */
		[Symbol.asyncDispose]: () => Promise<void>;
	};

/**
 * Create a workspace client with YJS-first architecture
 * Uses flat dependency resolution with VS Code-style peer dependency model
 * All transitive dependencies must be present in workspace.dependencies (hoisted to root)
 * Initialization uses topological sort for deterministic, predictable order
 *
 * @param workspace - Workspace configuration to initialize
 * @param config - Runtime configuration options
 * @returns Initialized workspace client
 */
export function createWorkspaceClient<
	const TId extends string,
	const TVersion extends number,
	TWorkspaceSchema extends WorkspaceSchema,
	const TDeps extends readonly AnyWorkspaceConfig[],
	const TIndexes extends WorkspaceIndexMap<TWorkspaceSchema>,
	TActionMap extends WorkspaceActionMap,
>(
	workspace: WorkspaceConfig<
		TId,
		TVersion,
		string,
		TWorkspaceSchema,
		TDeps,
		TIndexes,
		TActionMap
	>,
	config: RuntimeConfig = {},
): WorkspaceClient<TActionMap> {
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
	const workspaceConfigs = new Map<string, AnyWorkspaceConfig>();

	/**
	 * Register a workspace config, automatically resolving version conflicts.
	 * If a workspace with the same ID is already registered, compares versions
	 * and keeps the highest one. Versions are compared as integers.
	 */
	const registerWorkspace = (ws: AnyWorkspaceConfig) => {
		const existing = workspaceConfigs.get(ws.id);
		if (!existing) {
			workspaceConfigs.set(ws.id, ws);
		} else {
			// Compare versions as numbers
			if (ws.version > existing.version) {
				// New version is higher, replace
				workspaceConfigs.set(ws.id, ws);
			}
			// Otherwise keep existing (higher or equal version)
		}
	};

	// Register all dependencies from root workspace
	if (workspace.dependencies) {
		for (const dep of workspace.dependencies) {
			registerWorkspace(dep);
		}
	}

	// Register the root workspace itself
	registerWorkspace(workspace as unknown as AnyWorkspaceConfig);

	// ═══════════════════════════════════════════════════════════════════════════
	// PHASE 2: BUILD DEPENDENCY GRAPH
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

	// Build the graph by processing each workspace's dependencies
	for (const [id, ws] of workspaceConfigs) {
		if (ws.dependencies && ws.dependencies.length > 0) {
			for (const dep of ws.dependencies) {
				// Verify dependency exists in registry
				if (!workspaceConfigs.has(dep.id)) {
					throw new Error(
						`Missing dependency: workspace "${id}" depends on "${dep.id}", ` +
							`but it was not found in root workspace.dependencies.\n\n` +
							`Fix: Add "${dep.id}" to the root workspace's dependencies array (flat/hoisted resolution).\n` +
							`All transitive dependencies must be declared at the root level.`,
					);
				}

				// Add edge: dep.id -> id (id depends on dep.id)
				dependents.get(dep.id)!.push(id);

				// Increment in-degree for the dependent workspace
				inDegree.set(id, inDegree.get(id)! + 1);
			}
		}
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// PHASE 3: TOPOLOGICAL SORT (Kahn's Algorithm)
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
	// PHASE 4: INITIALIZE IN TOPOLOGICAL ORDER
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
		ws: AnyWorkspaceConfig,
	): WorkspaceClient<any> => {
		// Build the workspaces object by injecting already-initialized dependencies
		// Key: dependency name, Value: initialized client
		const workspaces: Record<string, any> = {};

		if (ws.dependencies && ws.dependencies.length > 0) {
			// Resolve dependencies from the registered configs (handles version resolution)
			// Build set of unique dependency IDs
			const uniqueDepIds = new Set(ws.dependencies.map((dep) => dep.id));

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
						`Duplicate dependency names detected in workspace "${ws.id}": ` +
							`multiple dependencies resolve to name "${resolvedConfig.name}". ` +
							`Each dependency must have a unique name.`,
					);
				}
				depNames.add(resolvedConfig.name);

				// Get the initialized client
				const depClient = clients.get(depId);
				if (!depClient) {
					throw new Error(
						`Internal error: dependency "${depId}" should have been initialized before "${ws.id}"`,
					);
				}

				// Inject using the resolved config's name
				workspaces[resolvedConfig.name] = depClient;
			}
		}

		// Now that all dependencies are ready, initialize this workspace's core components

		// Create YJS document with workspace ID as the document GUID
		const ydoc = new Y.Doc({ guid: ws.id });

		// Initialize Epicenter database (wraps YJS with table/record API)
		const db = createEpicenterDb(ydoc, ws.schema);

		// Call the indexes factory function to get index definitions
		const indexesObject = ws.indexes({ db });

		// Validate no duplicate index IDs (keys of returned object)
		const indexIds = Object.keys(indexesObject);
		if (new Set(indexIds).size !== indexIds.length) {
			throw new Error('Duplicate index IDs detected');
		}

		// Initialize each index by calling its init function
		// Indexes set up observers on the YJS document and return query functions
		const indexes: Record<
			string,
			{ destroy: () => void | Promise<void>; queries: any }
		> = {};

		for (const [indexKey, index] of Object.entries(indexesObject)) {
			try {
				indexes[indexKey] = index.init(db);
			} catch (error) {
				console.error(`Failed to initialize index "${indexKey}":`, error);
			}
		}

		// Set up YDoc synchronization and persistence (if user provided a setupYDoc function)
		ws.setupYDoc?.(ydoc);

		// Create the IndexesAPI object that will be passed to actions
		// Extract just the query functions from each index (hide internal details)
		const indexesAPI = Object.fromEntries(
			Object.entries(indexes).map(([indexName, index]) => [
				indexName,
				index.queries,
			]),
		);

		// Call the actions factory to get action definitions, passing:
		// - workspaces: initialized dependency clients (keyed by dep.name)
		// - db: Epicenter database API
		// - indexes: query functions for each index
		const actionMap = ws.actions({
			workspaces,
			db,
			indexes: indexesAPI,
		});

		// Create cleanup function
		const cleanup = async () => {
			// Clean up indexes first
			for (const index of Object.values(indexes)) {
				await index.destroy?.();
			}

			// Clean up YDoc (disconnects providers, cleans up observers)
			ydoc.destroy();
		};

		// Create the workspace client by extracting handlers from actions
		// and adding cleanup methods
		const client: WorkspaceClient<any> = {
			...extractHandlers(actionMap),
			destroy: cleanup,
			[Symbol.asyncDispose]: cleanup,
		};

		return client;
	};

	// Initialize all workspaces in topological order
	for (const workspaceId of sorted) {
		const ws = workspaceConfigs.get(workspaceId)!;
		const client = initializeWorkspace(ws);
		clients.set(workspaceId, client);
	}

	// Return the client for the root workspace
	const rootClient = clients.get(workspace.id);
	if (!rootClient) {
		throw new Error(
			`Internal error: root workspace "${workspace.id}" was not initialized`,
		);
	}

	return rootClient;
}
