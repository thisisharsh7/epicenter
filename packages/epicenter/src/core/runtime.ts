import * as Y from 'yjs';
import { createEpicenterDb } from '../db/core';
import type { WorkspaceActionMap } from './actions';
import type { WorkspaceSchema } from './schema';
import type { Index } from './indexes';
import type { ExtractHandlers, IndexesAPI, WorkspaceConfig } from './workspace';
import { extractHandlers } from './workspace';

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
	};

/**
 * Create a workspace client with YJS-first architecture
 * Uses flat dependency resolution with VS Code-style peer dependency model
 * All transitive dependencies must be present in workspace.dependencies (hoisted to root)
 * Lazy initialization: workspaces are initialized on-demand when their dependents need them
 *
 * @param workspace - Workspace configuration to initialize
 * @param config - Runtime configuration options
 * @returns Initialized workspace client
 */
export async function createWorkspaceClient<
	const TId extends string,
	const TVersion extends string,
	TWorkspaceSchema extends WorkspaceSchema,
	TActionMap extends WorkspaceActionMap,
	const TIndexes extends Record<string, Index<TWorkspaceSchema>>,
	const TDeps extends readonly WorkspaceConfig[] = readonly [],
>(
	workspace: WorkspaceConfig<
		TId,
		TVersion,
		TWorkspaceSchema,
		TActionMap,
		TIndexes,
		string,
		TDeps
	>,
	config: RuntimeConfig = {},
): Promise<WorkspaceClient<TActionMap>> {
	// 1. Pre-populate Maps with root workspace.dependencies (already flat!)
	// We maintain two maps:
	// - workspaceConfigs: tracks the highest version of each workspace to use
	// - clients: tracks initialization state (null = not initialized, WorkspaceClient = initialized)
	const workspaceConfigs = new Map<
		string,
		WorkspaceConfig<any, any, any, any, any, any, readonly WorkspaceConfig[]>
	>();
	const clients = new Map<string, WorkspaceClient<any> | null>();

	// Track workspaces currently being initialized to detect circular dependencies
	const initializing = new Set<string>();

	// Pre-populate with dependencies, keeping the highest version of each workspace
	// Versions are compared as integers (e.g., "1", "2", "3")
	// If you need semantic versioning (major.minor.patch), use a semver library
	if (workspace.dependencies) {
		for (const dep of workspace.dependencies) {
			const existing = workspaceConfigs.get(dep.id);
			if (!existing) {
				// First time seeing this workspace ID
				workspaceConfigs.set(dep.id, dep);
				clients.set(dep.id, null);
			} else {
				// Already seen this workspace ID, compare versions as integers
				const depVersionNum = parseInt(dep.version, 10);
				const existingVersionNum = parseInt(existing.version, 10);

				if (depVersionNum > existingVersionNum) {
					// New version is higher, replace it
					workspaceConfigs.set(dep.id, dep);
					// Note: client stays null, will be re-initialized with new version
				}
				// If existing version is higher or equal, keep it
			}
		}
	}

	// 2. Helper function: Ensure a workspace is initialized (idempotent)
	// This function can be called multiple times safely. If the workspace is already
	// initialized, it returns the existing client. Otherwise, it initializes the workspace
	// by recursively ensuring all its dependencies are initialized first.
	// Version resolution: Always uses the highest version available in workspaceConfigs
	const ensureWorkspace = async (
		ws: WorkspaceConfig<any, any, any, any, any, any, readonly WorkspaceConfig[]>,
	): Promise<WorkspaceClient<any>> => {
		// Check if we have a higher version of this workspace already registered
		const configInMap = workspaceConfigs.get(ws.id);
		if (configInMap) {
			// Compare versions as integers and use the higher one
			const wsVersionNum = parseInt(ws.version, 10);
			const configVersionNum = parseInt(configInMap.version, 10);

			if (wsVersionNum > configVersionNum) {
				// Passed-in version is higher, update the map
				workspaceConfigs.set(ws.id, ws);
				// Force re-initialization by removing any existing client
				clients.set(ws.id, null);
			} else {
				// Existing version is higher or equal, use it instead
				ws = configInMap;
			}
		} else {
			// First time seeing this workspace, add it to the map
			workspaceConfigs.set(ws.id, ws);
			clients.set(ws.id, null);
		}

		// Return existing client if already initialized (idempotent behavior)
		const existingClient = clients.get(ws.id);
		if (existingClient) return existingClient;

		// Detect circular dependencies (A depends on B, B depends on A)
		// If we're already in the process of initializing this workspace, it means
		// we hit a circular dependency chain
		if (initializing.has(ws.id)) {
			throw new Error(
				`Circular dependency detected: workspace "${ws.id}" depends on itself (directly or transitively)`,
			);
		}

		// Mark this workspace as currently being initialized
		initializing.add(ws.id);
		

		// Ensure all dependencies are initialized first (recursive + lazy)
		// Dependencies are initialized in parallel for better performance.
		// Each dependency may have its own dependencies, which will be recursively
		// ensured by the ensureWorkspace call.
		const workspaces: Record<string, any> = {};
		if (ws.dependencies && ws.dependencies.length > 0) {
			// Validate that all dependency names are unique to prevent collisions
			// in the workspaces object (keyed by dep.name)
			const depNames = ws.dependencies.map((dep) => dep.name);
			if (new Set(depNames).size !== depNames.length) {
				throw new Error(
					`Duplicate dependency names detected in workspace "${ws.id}". ` +
						`All dependency names must be unique.`,
				);
			}

			// Initialize all dependencies in parallel for better performance
			// Independent dependencies can be initialized concurrently
			const depClients = await Promise.all(
				ws.dependencies.map(async (dep) => {
					// Verify dependency exists in root dependencies (flat resolution)
					if (!clients.has(dep.id)) {
						throw new Error(
							`Missing dependency: workspace "${ws.id}" depends on "${dep.id}", ` +
								`but it was not found in root workspace.dependencies. Please add it to the root dependencies array.`,
						);
					}

					// Recursively ensure this dependency is initialized
					// (if already initialized, returns immediately)
					const client = await ensureWorkspace(dep);
					return { name: dep.name, client };
				}),
			);

			// Build the workspaces object that will be passed to actions
			// Key: dependency name, Value: initialized client
			for (const { name, client } of depClients) {
				workspaces[name] = client;
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

		// Create the workspace client by extracting handlers from actions
		// and adding a destroy method for cleanup
		const client: WorkspaceClient<any> = {
			...extractHandlers(actionMap),
			destroy: async () => {
				// Clean up indexes first
				for (const index of Object.values(indexes)) {
					await index.destroy?.();
				}

				// Clean up YDoc (disconnects providers, cleans up observers)
				ydoc.destroy();
			},
		};

		// Store the initialized client in the Map
		clients.set(ws.id, client);

		// Remove from initializing Set (no longer "in progress")
		initializing.delete(ws.id);

		return client;
	};

	// 3. Ensure the root workspace is initialized and return it
	// This call will recursively ensure all dependencies are initialized via ensureWorkspace
	// Version resolution happens automatically: ensureWorkspace will use the highest version
	// available in workspaceConfigs, or add it if this is the first time seeing it
	return await ensureWorkspace(workspace);
}
