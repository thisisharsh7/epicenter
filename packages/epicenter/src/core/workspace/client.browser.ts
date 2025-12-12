/**
 * Browser-specific workspace client entry point.
 *
 * In browser environments, storageDir and epicenterDir are always undefined
 * since filesystem operations are not available.
 *
 * IMPORTANT: Browser initialization is SYNCHRONOUS because browser providers
 * (IndexedDB persistence, WebSocket sync) handle their async operations internally.
 * This enables immediate client usage without await.
 *
 * Browser clients include a `whenSynced` promise that resolves when all providers
 * have completed their initial sync. This follows the y-indexeddb pattern:
 * - Construction is synchronous (returns immediately)
 * - Async work happens in background
 * - `whenSynced` resolves when ready
 *
 * @see https://github.com/yjs/y-indexeddb - Inspiration for the whenSynced pattern
 */

import * as Y from 'yjs';
import type { WorkspaceActionMap, WorkspaceExports } from '../actions';
import { createEpicenterDb } from '../db/core';
import type { Provider, ProviderExports } from '../provider';
import type { WorkspaceSchema } from '../schema';
import { createWorkspaceValidators } from '../schema';
import type { AnyWorkspaceConfig, WorkspaceConfig } from './config';

// ═══════════════════════════════════════════════════════════════════════════════
// BROWSER-SPECIFIC TYPES
//
// Browser WorkspaceClient includes `whenSynced` promise.
// This follows the y-indexeddb pattern: sync construction, deferred sync.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Browser-specific workspace client with `whenSynced` support.
 *
 * A workspace client is not a standalone concept. It's a single workspace extracted from an Epicenter client.
 * An Epicenter client is an object of workspace clients: `{ workspaceId: WorkspaceClient }`.
 *
 * This follows the y-indexeddb pattern:
 * - Construction is synchronous (returns immediately)
 * - Async work (IndexedDB load, WebSocket sync) happens in background
 * - `whenSynced` resolves when all providers are ready
 *
 * **Usage in UI (recommended)**: Wait once at the root layout
 * ```svelte
 * {#await client.whenSynced}
 *   <LoadingSpinner />
 * {:then}
 *   <App />
 * {/await}
 * ```
 *
 * **Usage in scripts**: Await before operations that need synced data
 * ```typescript
 * await client.whenSynced;
 * const data = client.getAllData();
 * ```
 *
 * @see https://github.com/yjs/y-indexeddb - Inspiration for this pattern
 */
export type WorkspaceClient<TExports extends WorkspaceExports> = TExports & {
	/** The underlying YJS document for this workspace. */
	$ydoc: Y.Doc;

	/**
	 * Promise that resolves when all providers have completed their initial sync.
	 *
	 * Browser providers (IndexedDB, WebSocket) load data asynchronously in the
	 * background. This promise resolves when all providers report they are synced.
	 *
	 * If no providers have `whenSynced`, this resolves immediately.
	 */
	whenSynced: Promise<void>;

	/** Async cleanup method - destroys all providers and the YJS document. */
	destroy: () => Promise<void>;

	/** Async disposal for `await using` syntax. */
	[Symbol.asyncDispose]: () => Promise<void>;
};

/**
 * Browser-specific mapping of workspace configs to clients.
 *
 * Uses the browser `WorkspaceClient` type which includes `whenSynced`.
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

// ═══════════════════════════════════════════════════════════════════════════════
// SYNCHRONOUS INITIALIZATION (Browser)
//
// This is nearly identical to client.node.ts, with one key difference:
// - Browser: Providers are called WITHOUT await (sync)
// - Node.js: Providers are called WITH await (async)
//
// Browser providers like IndexedDB persistence and WebSocket sync handle their
// async operations internally. They return immediately and sync data in the
// background, enabling immediate client usage without blocking on I/O.
//
// This duplication is intentional for clarity - you can read this file
// top-to-bottom without jumping between files.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Initializes multiple workspaces SYNCHRONOUSLY.
 * Browser version - providers are called without await.
 *
 * Uses flat dependency resolution with VS Code-style peer dependency model.
 * All transitive dependencies must be present in the provided workspaces array (flat/hoisted).
 * Initialization uses topological sort for deterministic, predictable order.
 *
 * @param workspaceConfigs - Array of workspace configurations to initialize
 * @returns Object mapping workspace ids to initialized workspace clients
 */
export function initializeWorkspaces<
	const TConfigs extends readonly AnyWorkspaceConfig[],
>(workspaceConfigs: TConfigs): WorkspacesToClients<TConfigs> {
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
	// PHASE 5: INITIALIZE IN TOPOLOGICAL ORDER (SYNC)
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
	 * Initialize a single workspace SYNCHRONOUSLY (non-recursive).
	 * All dependencies are guaranteed to be already initialized because we're
	 * processing workspaces in topological order. This function:
	 * 1. Injects already-initialized dependency clients
	 * 2. Creates YDoc, tables, providers, and exports
	 * 3. Returns the initialized workspace client
	 *
	 * NOTE: Unlike client.node.ts, this does NOT await provider factories.
	 * Browser providers handle async internally (IndexedDB loads in background).
	 */
	const initializeWorkspace = (
		workspaceConfig: WorkspaceConfig,
	): WorkspaceClient<any> => {
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
		// KEY DIFFERENCE FROM client.node.ts:
		// We call provider factories WITHOUT await. Browser providers like
		// IndexedDB persistence and WebSocket sync handle async internally.
		// If a provider returns a Promise, we track it but don't block.
		//
		// We also collect `whenSynced` promises from providers to aggregate them
		// into a single `whenSynced` promise on the workspace client.
		// ═══════════════════════════════════════════════════════════════════════
		const providers: Record<string, ProviderExports> = {};

		/**
		 * Promises that resolve when providers complete their initial sync.
		 * Collected from:
		 * 1. Async provider factories (the promise itself)
		 * 2. Sync providers that return a `whenSynced` property
		 */
		const syncPromises: Promise<void>[] = [];

		for (const [providerId, providerFn] of Object.entries(
			workspaceConfig.providers,
		)) {
			// Call provider without await - browser providers handle async internally
			const result = providerFn({
				id: workspaceConfig.id,
				providerId,
				ydoc,
				schema: workspaceConfig.tables,
				tables,
				storageDir: undefined, // No filesystem in browser
				epicenterDir: undefined, // No filesystem in browser
			});

			if (result instanceof Promise) {
				// Provider factory is async - track its completion and any whenSynced it returns
				const trackedPromise = result.then((exports) => {
					providers[providerId] = exports ?? {};
					// If the resolved exports have a whenSynced, track that too
					if (exports?.whenSynced) {
						return exports.whenSynced;
					}
				});
				syncPromises.push(trackedPromise);
			} else {
				// Provider factory is sync - store exports immediately
				providers[providerId] = result ?? {};

				// If provider returned a whenSynced promise, track it
				if (result?.whenSynced) {
					syncPromises.push(result.whenSynced);
				}
			}
		}

		// Aggregate all sync promises into a single whenSynced promise
		const whenSynced =
			syncPromises.length > 0
				? Promise.all(syncPromises).then(() => {})
				: Promise.resolve();

		// Call the exports factory to get workspace exports (actions + utilities), passing:
		// - tables: Epicenter tables API for direct table operations
		// - schema: The workspace schema (table definitions)
		// - validators: Schema validators for runtime validation and arktype composition
		// - providers: exported resources from each provider (db, queries, etc.)
		// - workspaces: full clients from dependencies (all exports, not filtered!)
		// - storageDir: undefined (no filesystem in browser)
		// - epicenterDir: undefined (no filesystem in browser)
		// Note: blobs are commented out until browser-compatible implementation exists
		const exports = workspaceConfig.exports({
			tables,
			schema: workspaceConfig.tables,
			validators,
			providers,
			workspaces: workspaceClients,
			// blobs temporarily disabled for browser compatibility
			blobs: {} as any,
			storageDir: undefined,
			epicenterDir: undefined,
		});

		// Create async cleanup function
		// Note: Cleanup is still async because providers may need async cleanup
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
		// Browser clients include `whenSynced` for the y-indexeddb pattern
		const client: WorkspaceClient<any> = {
			...exports,
			$ydoc: ydoc,
			whenSynced,
			destroy: cleanup,
			[Symbol.asyncDispose]: cleanup,
		};

		return client;
	};

	// Initialize all workspaces in topological order (sync)
	for (const workspaceId of sorted) {
		const workspaceConfig = workspaceConfigsMap.get(workspaceId)!;
		const client = initializeWorkspace(workspaceConfig);
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
 * In browser environments, storageDir is always undefined (no filesystem access).
 *
 * IMPORTANT: This is SYNCHRONOUS in browser - no await needed.
 */
export function createWorkspaceClient<
	const TDeps extends readonly AnyWorkspaceConfig[],
	const TId extends string,
	TWorkspaceSchema extends WorkspaceSchema,
	const TProviders extends Record<string, Provider<TWorkspaceSchema>>,
	TExports extends WorkspaceExports,
>(
	workspace: WorkspaceConfig<TDeps, TId, TWorkspaceSchema, TProviders, TExports>,
): WorkspaceClient<TExports> {
	// Collect all workspace configs (target + dependencies) for flat/hoisted initialization
	const allWorkspaceConfigs: WorkspaceConfig[] = [];

	if (workspace.dependencies) {
		allWorkspaceConfigs.push(
			...(workspace.dependencies as unknown as WorkspaceConfig[]),
		);
	}

	allWorkspaceConfigs.push(workspace as unknown as WorkspaceConfig);

	// Browser: sync initialization
	const clients = initializeWorkspaces(allWorkspaceConfigs);

	const workspaceClient = clients[workspace.id as keyof typeof clients];
	if (!workspaceClient) {
		throw new Error(
			`Internal error: workspace "${workspace.id}" was not initialized`,
		);
	}

	return workspaceClient as WorkspaceClient<TExports>;
}
