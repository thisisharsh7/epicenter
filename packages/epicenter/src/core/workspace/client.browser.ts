/**
 * Browser workspace client implementation.
 *
 * Provides createClient for browser environments (web apps, browser extensions, Tauri).
 * Browser clients are SYNCHRONOUS - they return immediately with a `whenSynced` promise.
 * This follows the y-indexeddb pattern: sync construction, deferred sync.
 *
 * @see https://github.com/yjs/y-indexeddb
 */
import * as Y from 'yjs';
import { type Actions, walkActions } from '../actions';
import { createEpicenterDb } from '../db/core';
import type { Providers, WorkspaceProviderMap } from '../provider';
import { createWorkspaceValidators, type WorkspaceSchema } from '../schema';
import type {
	ActionInfo,
	EpicenterClientBase,
	WorkspaceClientInternals,
} from './client.shared';
import type { AnyWorkspaceConfig, WorkspaceConfig } from './config';

/**
 * A workspace client contains all workspace actions plus lifecycle management.
 *
 * Unlike Node.js clients, browser clients return immediately and expose
 * a `whenSynced` promise for waiting on provider initialization.
 * Actions (queries and mutations) are identified at runtime via type guards for API/MCP mapping.
 *
 * Inherits `$ydoc`, `$tables`, `$providers`, `destroy`, and `[Symbol.asyncDispose]` from
 * {@link WorkspaceClientInternals}. Browser-specific: adds `whenSynced` promise.
 */
export type WorkspaceClient<
	TActions extends Actions,
	TSchema extends WorkspaceSchema = WorkspaceSchema,
	TProviders extends WorkspaceProviderMap = WorkspaceProviderMap,
> = TActions &
	WorkspaceClientInternals<TSchema, TProviders> & {
		/**
		 * Promise that resolves when all providers have completed initial sync.
		 *
		 * Browser providers (like IndexedDB persistence) load asynchronously.
		 * The client is usable immediately, but data may not be fully loaded.
		 * Await this promise when you need to ensure all data is available.
		 *
		 * @example
		 * ```typescript
		 * const client = createClient(blogWorkspace);
		 * // Client is usable immediately, but data may still be loading
		 * await client.whenSynced;
		 * // Now all providers have completed their initial sync
		 * const posts = client.getAllPosts();
		 * ```
		 */
		whenSynced: Promise<void>;
	};

/**
 * Maps an array of workspace configs to an object of WorkspaceClients keyed by workspace id.
 */
export type WorkspacesToClients<WS extends readonly AnyWorkspaceConfig[]> = {
	[W in WS[number] as W extends { id: infer TId extends string }
		? TId
		: never]: W extends {
		// biome-ignore lint/suspicious/noExplicitAny: Extracting action type from generic constraint
		actions: (context: any) => infer TActions extends Actions;
	}
		? WorkspaceClient<TActions>
		: never;
};

/**
 * Client for multiple workspaces in browser environments.
 *
 * Maps workspace IDs to their clients. Browser-specific: adds aggregate `whenSynced`
 * that resolves when all workspaces have completed initial sync.
 *
 * Inherits `destroy` and `[Symbol.asyncDispose]` from {@link EpicenterClientBase}.
 */
export type EpicenterClient<TWorkspaces extends readonly AnyWorkspaceConfig[]> =
	WorkspacesToClients<TWorkspaces> &
		EpicenterClientBase & {
			/**
			 * Promise that resolves when all workspaces have completed initial sync.
			 */
			whenSynced: Promise<void>;
		};

/**
 * Create a client for a single workspace (browser, SYNCHRONOUS).
 *
 * Returns immediately with a client that has a `whenSynced` promise.
 * In browser environments, there is no projectDir (uses IndexedDB for persistence).
 *
 * @param workspace - Workspace configuration to initialize
 * @returns Workspace client with `whenSynced` promise for deferred sync
 *
 * @example
 * ```typescript
 * // Immediate usage (data may still be loading from IndexedDB)
 * const client = createClient(blogWorkspace);
 * client.createPost({ title: 'Hello' }); // Works immediately
 *
 * // Wait for full sync before reading
 * const client = createClient(blogWorkspace);
 * await client.whenSynced;
 * const posts = client.getAllPosts(); // All data now available
 *
 * // Cleanup
 * await client.destroy();
 * ```
 */
export function createClient<
	const TDeps extends readonly AnyWorkspaceConfig[],
	const TId extends string,
	TWorkspaceSchema extends WorkspaceSchema,
	const TProviderResults extends WorkspaceProviderMap,
	TActions extends Actions,
>(
	workspace: WorkspaceConfig<
		TDeps,
		TId,
		TWorkspaceSchema,
		TProviderResults,
		TActions
	>,
): WorkspaceClient<TActions>;

/**
 * Create a client for multiple workspaces (browser, SYNCHRONOUS).
 * Initializes all workspaces in dependency order, returns an object mapping workspace IDs to clients.
 *
 * Returns immediately with a client that has aggregate `whenSynced` promise.
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
 *   const client = createClient(workspaces);
 *   client.pages.createPage(...);
 *   client['content-hub'].createPost(...);
 *   client.auth.login(...);
 *   ```
 * @returns Client with all workspaces and aggregate `whenSynced` promise
 *
 * @example
 * ```typescript
 * const client = createClient([blogWorkspace, authWorkspace]);
 *
 * // Wait for all workspaces to sync
 * await client.whenSynced;
 *
 * // Access workspace actions by workspace id
 * await client.blog.createPost({ title: 'Hello' });
 * await client.auth.login({ email: 'user@example.com' });
 * ```
 */
export function createClient<
	const TConfigs extends readonly AnyWorkspaceConfig[],
>(workspaces: TConfigs): EpicenterClient<TConfigs>;

export function createClient(
	input: AnyWorkspaceConfig | readonly AnyWorkspaceConfig[],
): WorkspaceClient<any> | EpicenterClient<any> {
	if (Array.isArray(input)) {
		const clients = initializeWorkspacesSync(input);

		const allSyncPromises = Object.values(clients).map((c) => c.whenSynced);

		const cleanup = async () => {
			await Promise.all(Object.values(clients).map((c) => c.destroy()));
		};

		const actionRegistry: ActionInfo[] = [];
		for (const [workspaceId, client] of Object.entries(clients)) {
			const {
				$ydoc: _,
				$tables: __,
				$providers: ___,
				$validators: ____,
				$workspaces: _____,
				$blobs: ______,
				$paths: _______,
				whenSynced: ________,
				destroy: _________,
				[Symbol.asyncDispose]: __________,
				...actions
			} = client;
			for (const { path, action } of walkActions(actions)) {
				actionRegistry.push({ workspaceId, actionPath: path, action });
			}
		}

		return {
			...clients,
			$actions: actionRegistry,
			whenSynced: Promise.all(allSyncPromises).then(() => {}),
			destroy: cleanup,
			[Symbol.asyncDispose]: cleanup,
		} as unknown as EpicenterClient<any>;
	}

	const workspace = input as WorkspaceConfig;
	const allWorkspaceConfigs: WorkspaceConfig[] = [];

	if (workspace.dependencies) {
		allWorkspaceConfigs.push(
			...(workspace.dependencies as unknown as WorkspaceConfig[]),
		);
	}
	allWorkspaceConfigs.push(workspace);

	const clients = initializeWorkspacesSync(allWorkspaceConfigs);

	const workspaceClient = clients[workspace.id as keyof typeof clients];
	if (!workspaceClient) {
		throw new Error(
			`Internal error: workspace "${workspace.id}" was not initialized`,
		);
	}

	// biome-ignore lint/suspicious/noExplicitAny: Type safety enforced by overload signatures
	return workspaceClient as WorkspaceClient<any>;
}

/**
 * Internal function that synchronously initializes multiple workspaces with shared dependency resolution.
 * Uses flat dependency resolution with VS Code-style peer dependency model.
 * All transitive dependencies must be present in the provided workspaces array (flat/hoisted).
 * Initialization uses topological sort for deterministic, predictable order.
 *
 * Browser-specific: Returns immediately with `whenSynced` promises for deferred provider sync.
 *
 * @param workspaceConfigs - Array of workspace configurations to initialize
 * @returns Object mapping workspace ids to initialized workspace clients with `whenSynced` promises
 */
function initializeWorkspacesSync<
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
						`Missing dependency: workspace "${workspaceId}" depends on "${dep.id}", but it was not found.\n\nFix: Add "${dep.id}" to the workspaces array (flat/hoisted resolution).\nAll transitive dependencies must be declared at the root level.`,
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
	// Initialize workspaces one by one in dependency order (synchronously)
	// Browser-specific: Collect whenSynced promises for deferred provider sync
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Map of workspace ID to initialized workspace client.
	 * Each client exposes all workspace exports (actions, utilities, constants).
	 * Populated as we initialize each workspace in topological order.
	 * When initializing workspace B that depends on A, we can safely
	 * inject clients[A] because A was initialized earlier in the sorted order.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: Map holds heterogeneous workspace clients
	const clients = new Map<string, WorkspaceClient<any>>();

	// Initialize all workspaces in topological order (synchronously)
	for (const workspaceId of sorted) {
		const workspaceConfig = workspaceConfigsMap.get(workspaceId)!;

		// Build the workspaceClients object by injecting already-initialized dependencies
		// biome-ignore lint/suspicious/noExplicitAny: Dependency clients are heterogeneous
		const workspaceClients: Record<string, WorkspaceClient<any>> = {};

		if (
			workspaceConfig.dependencies &&
			workspaceConfig.dependencies.length > 0
		) {
			for (const dep of workspaceConfig.dependencies) {
				const depClient = clients.get(dep.id);
				if (depClient) workspaceClients[dep.id] = depClient;
			}
		}

		// Create YJS document with workspace ID as the document GUID
		const ydoc = new Y.Doc({ guid: workspaceConfig.id });

		// Initialize Epicenter tables (wraps YJS with table/record API)
		const tables = createEpicenterDb(ydoc, workspaceConfig.tables);

		// Create validators for runtime validation and arktype composition
		const validators = createWorkspaceValidators(workspaceConfig.tables);

		// Initialize all providers synchronously, collecting deferred sync promises
		// Browser providers return sync but may load data async via whenSynced
		const providers: Record<string, Providers> = {};
		const providerPromises: Promise<Providers>[] = [];

		for (const [providerId, providerFn] of Object.entries(
			workspaceConfig.providers,
		)) {
			const result = providerFn({
				id: workspaceConfig.id,
				providerId,
				ydoc,
				schema: workspaceConfig.tables,
				tables,
				paths: undefined,
			});

			if (result instanceof Promise) {
				providerPromises.push(
					result.then((exports) => {
						providers[providerId] = exports ?? {};
						return exports ?? {};
					}),
				);
			} else {
				providers[providerId] = result ?? {};
			}
		}

		// Aggregate whenSynced: wait for async providers, then collect their whenSynced
		const whenSynced = Promise.all(providerPromises)
			.then(() =>
				Promise.all(
					Object.values(providers)
						.map((p) => p.whenSynced)
						.filter((p): p is Promise<unknown> => p instanceof Promise),
				),
			)
			.then(() => {});

		// biome-ignore lint/suspicious/noExplicitAny: Blobs type requires workspace schema inference
		const blobs = {} as any;

		// Create workspace actions by calling the actions factory
		const actions = workspaceConfig.actions({
			ydoc,
			tables,
			validators,
			providers,
			// biome-ignore lint/suspicious/noExplicitAny: Runtime types are correct, generic constraint too strict
			workspaces: workspaceClients as any,
			blobs,
			paths: undefined,
		});

		// Create async cleanup function
		const cleanup = async () => {
			// Clean up providers first (destroy is optional for providers)
			await Promise.all(
				Object.values(providers).map((provider) => provider.destroy?.()),
			);

			// Clean up YDoc (disconnects providers, cleans up observers)
			ydoc.destroy();
		};

		// Create the workspace client with all actions
		clients.set(workspaceId, {
			...actions,
			$ydoc: ydoc,
			$tables: tables,
			$providers: providers,
			$validators: validators,
			$workspaces: workspaceClients,
			$blobs: blobs,
			$paths: undefined,
			whenSynced,
			destroy: cleanup,
			[Symbol.asyncDispose]: cleanup,
		});
	}

	// Convert Map to typed object keyed by workspace id
	const initializedWorkspaces: Record<string, WorkspaceClient<Actions>> = {};
	for (const [workspaceId, client] of clients) {
		initializedWorkspaces[workspaceId] = client;
	}

	return initializedWorkspaces as WorkspacesToClients<TConfigs>;
}
