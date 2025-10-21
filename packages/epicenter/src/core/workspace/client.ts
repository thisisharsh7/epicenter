import * as Y from 'yjs';
import { createEpicenterDb } from '../../db/core';
import type { WorkspaceActionMap } from '../actions';
import type { WorkspaceIndexMap } from '../indexes';
import type { WorkspaceSchema } from '../schema';
import type {
	AnyEpicenterConfig,
	EpicenterConfig,
} from './config';

/**
 * Represents a single epicenter's namespace containing its actions and lifecycle management.
 * This type is used internally when epicenters are composed together, and each workspace
 * is accessible as a namespace within the parent epicenter.
 *
 * Structure: `{ action1: fn, action2: fn, ..., destroy: fn }`
 */
export type WorkspaceNamespace<TActionMap extends WorkspaceActionMap> =
	TActionMap & {
		/**
		 * Cleanup method for resource management
		 * - Destroys all indexes
		 * - Destroys the YJS document
		 */
		destroy: () => void;
	};

/**
 * Mapped type that converts array of epicenter configs to object of initialized clients.
 * Extracts epicenter names and ActionMaps to create fully-typed client object.
 *
 * @example
 * ```typescript
 * // Given configs:
 * const epicenterA = defineEpicenter({ id: 'epicenter-a', name: 'epicenterA', actions: { foo: ... } })
 * const epicenterB = defineEpicenter({ id: 'epicenter-b', name: 'epicenterB', actions: { bar: ... } })
 *
 * // Returns type:
 * {
 *   epicenterA: WorkspaceNamespace<{ foo: ... }>,
 *   epicenterB: WorkspaceNamespace<{ bar: ... }>
 * }
 * ```
 */
type InitializedEpicenters<TConfigs extends readonly AnyEpicenterConfig[]> = {
	[W in TConfigs[number] as W extends { name: infer TName extends string }
		? TName
		: never]: W extends {
		actions?: (context: any) => infer TActionMap extends WorkspaceActionMap;
	}
		? WorkspaceNamespace<TActionMap>
		: never;
};

/**
 * Internal function that initializes multiple epicenters with shared workspace resolution.
 * Uses flat workspace resolution with VS Code-style peer dependency model.
 * All transitive workspaces must be present in the root epicenter's workspaces (hoisted to root).
 * Initialization uses topological sort for deterministic, predictable order.
 *
 * @param rootEpicenterConfigs - Array of root epicenter configurations to initialize
 * @returns Object mapping epicenter names to initialized epicenter clients
 */
export async function initializeEpicenters<
	const TConfigs extends readonly AnyEpicenterConfig[],
>(rootEpicenterConfigs: TConfigs): Promise<InitializedEpicenters<TConfigs>> {
	// ═══════════════════════════════════════════════════════════════════════════
	// PHASE 1: REGISTRATION
	// Register all epicenter configs with version resolution
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Registry mapping epicenter ID to the highest version of that epicenter's config.
	 * When the same epicenter appears multiple times with different versions,
	 * we keep only the highest version (version compared as integers).
	 * Example: If both epicenterA v1 and epicenterA v3 are registered, we keep v3.
	 */
	const epicenterConfigs = new Map<
		string,
		EpicenterConfig
	>();

	// Register all root epicenter configs with automatic version resolution
	// If the same epicenter ID appears multiple times, keep the highest version
	for (const epicenterConfig of rootEpicenterConfigs) {
		// At runtime, all epicenter configs have full EpicenterConfig properties
		// The AnyEpicenterConfig constraint is only for type inference
		const config = epicenterConfig as unknown as EpicenterConfig;
		const existing = epicenterConfigs.get(config.id);
		if (!existing || config.version > existing.version) {
			// Either first time seeing this epicenter, or this version is higher
			epicenterConfigs.set(config.id, config);
		}
		// Otherwise keep existing (higher or equal version)
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// PHASE 2: WORKSPACE VERIFICATION
	// Verify that all workspaces exist in registered epicenters (flat/hoisted model)
	// ═══════════════════════════════════════════════════════════════════════════

	// Verify all workspaces for ALL registered epicenter configs (not just root-level ones)
	// This ensures the flat/hoisted model is correctly followed at every level:
	// - If A composes B and B composes C, both B and C must be in rootEpicenterConfigs
	// - By checking every epicenter in the map, we verify the entire composition tree
	//
	// Note: We only check direct workspaces (not recursive) because the flat/hoisted model
	// guarantees complete validation in a single pass. Example:
	// - Root config contains: [A, B, C]
	// - A.workspaces = [B]
	// - B.workspaces = [C]
	// - C.workspaces = []
	// Since each epicenter also has their transitive workspaces hoisted to the root,
	// we don't need recursion. Each epicenter's direct workspaces are sufficient.
	// When we iterate:
	// - Check A: verify B exists ✓
	// - Check B: verify C exists ✓
	// - Check C: no workspaces ✓
	for (const [epicenterId, epicenterConfig] of epicenterConfigs) {
		if (epicenterConfig.workspaces) {
			for (const ws of epicenterConfig.workspaces) {
				// Verify the workspace exists in registered configs (flat/hoisted model)
				if (!epicenterConfigs.has(ws.id)) {
					throw new Error(
						`Missing workspace: epicenter "${epicenterId}" has workspace "${ws.id}", ` +
							`but it was not found in rootEpicenterConfigs.\n\n` +
							`Fix: Add "${ws.id}" to rootEpicenterConfigs array (flat/hoisted resolution).\n` +
							`All transitive workspaces must be declared at the root level.`,
					);
				}
			}
		}
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// PHASE 3: BUILD WORKSPACE GRAPH
	// Create adjacency list and in-degree map for topological sort
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Adjacency list mapping epicenter ID to dependent epicenter IDs.
	 * Example: If epicenter B composes epicenter A, then dependents[A] contains [B]
	 * This represents the "outgoing edges" in the workspace graph.
	 */
	const dependents = new Map<string, string[]>();

	/**
	 * In-degree map tracking the number of workspaces for each epicenter.
	 * In-degree is the count of "incoming edges" (workspaces).
	 * Example: If epicenter C composes A and B, then inDegree[C] = 2
	 * Epicenters with in-degree 0 have no workspaces and can be initialized first.
	 */
	const inDegree = new Map<string, number>();

	// Initialize structures for all registered epicenters
	for (const id of epicenterConfigs.keys()) {
		dependents.set(id, []);
		inDegree.set(id, 0);
	}

	// Build the graph by processing each epicenter config's workspaces
	for (const [id, epicenterConfig] of epicenterConfigs) {
		if (
			epicenterConfig.workspaces &&
			epicenterConfig.workspaces.length > 0
		) {
			for (const ws of epicenterConfig.workspaces) {
				// Add edge: ws.id -> id (id composes ws.id)
				// Note: Workspaces are already verified in Phase 2
				dependents.get(ws.id)!.push(id);

				// Increment in-degree for the composing epicenter
				inDegree.set(id, inDegree.get(id)! + 1);
			}
		}
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// PHASE 4: TOPOLOGICAL SORT (Kahn's Algorithm)
	// Sort epicenters by workspace order
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Queue of epicenter IDs ready to be added to the sorted list.
	 * Starts with all epicenters that have zero workspaces (in-degree = 0).
	 * As we process each epicenter, we add new epicenters whose workspaces are satisfied.
	 */
	const queue: string[] = [];
	for (const [id, degree] of inDegree) {
		if (degree === 0) {
			queue.push(id);
		}
	}

	/**
	 * Sorted list of epicenter IDs in topological order.
	 * This is the initialization order: workspaces come before their composers.
	 * Example: If B composes A, then sorted = [A, B] (not [B, A])
	 */
	const sorted: string[] = [];

	// Process the queue
	while (queue.length > 0) {
		const currentId = queue.shift()!;
		sorted.push(currentId);

		// For each epicenter that composes the current epicenter
		for (const dependentId of dependents.get(currentId)!) {
			// Decrement in-degree (one workspace satisfied)
			const newDegree = inDegree.get(dependentId)! - 1;
			inDegree.set(dependentId, newDegree);

			// If all workspaces are satisfied, add to queue
			if (newDegree === 0) {
				queue.push(dependentId);
			}
		}
	}

	// Check for circular composition
	if (sorted.length !== epicenterConfigs.size) {
		const unsorted = Array.from(epicenterConfigs.keys()).filter(
			(id) => !sorted.includes(id),
		);
		throw new Error(
			`Circular composition detected. The following epicenters form a cycle: ${unsorted.join(', ')}`,
		);
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// PHASE 5: INITIALIZE IN TOPOLOGICAL ORDER
	// Initialize epicenters one by one in workspace order
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Map of epicenter ID to initialized epicenter client.
	 * Populated as we initialize each epicenter in topological order.
	 * When initializing epicenter B that composes A, we can safely
	 * inject clients[A] because A was initialized earlier in the sorted order.
	 */
	const clients = new Map<string, WorkspaceNamespace<any>>();

	/**
	 * Initialize a single epicenter (non-recursive).
	 * All workspaces are guaranteed to be already initialized because we're
	 * processing epicenters in topological order. This function:
	 * 1. Injects already-initialized workspace clients
	 * 2. Creates YDoc, DB, indexes, and actions (if epicenter has these features)
	 * 3. Returns the initialized epicenter client
	 */
	const initializeEpicenter = async (
		epicenterConfig: EpicenterConfig,
	): Promise<WorkspaceNamespace<any>> => {
		// Build the workspaceClients object by injecting already-initialized workspaces
		// Key: workspace name, Value: initialized client
		const workspaceClients: Record<string, WorkspaceNamespace<WorkspaceActionMap>> = {};

		if (
			epicenterConfig.workspaces &&
			epicenterConfig.workspaces.length > 0
		) {
			// Resolve workspaces from the registered configs (handles version resolution)
			// Build set of unique workspace IDs
			const uniqueWsIds = new Set(
				epicenterConfig.workspaces.map((ws) => ws.id),
			);

			// Inject workspace clients using resolved configs
			const wsNames = new Set<string>();
			for (const wsId of uniqueWsIds) {
				// Get the resolved config (might be a different version than originally specified)
				const resolvedConfig = epicenterConfigs.get(wsId);
				if (!resolvedConfig) {
					throw new Error(
						`Internal error: workspace "${wsId}" not found in registered configs`,
					);
				}

				// Check for duplicate names after version resolution
				if (wsNames.has(resolvedConfig.name)) {
					throw new Error(
						`Duplicate workspace names detected in epicenter "${epicenterConfig.id}": ` +
							`multiple workspaces resolve to name "${resolvedConfig.name}". ` +
							`Each workspace must have a unique name.`,
					);
				}
				wsNames.add(resolvedConfig.name);

				// Get the initialized client
				const wsClient = clients.get(wsId);
				if (!wsClient) {
					throw new Error(
						`Internal error: workspace "${wsId}" should have been initialized before "${epicenterConfig.id}"`,
					);
				}

				// Inject using the resolved config's name
				workspaceClients[resolvedConfig.name] = wsClient;
			}
		}

		// Now that all workspaces are ready, initialize this epicenter's core components (if it has features)

		// Initialize features only if epicenter has schema/indexes/actions
		// Pure composition epicenters (only workspaces, no features) won't have these
		if (epicenterConfig.schema || epicenterConfig.indexes || epicenterConfig.actions) {
			// Create YJS document with epicenter ID as the document GUID
			const ydoc = new Y.Doc({ guid: epicenterConfig.id });

			// Set up YDoc synchronization and persistence (if user provided a setupYDoc function)
			// IMPORTANT: This must run BEFORE createEpicenterDb so that persisted data is loaded
			// into the YDoc before table initialization
			epicenterConfig.setupYDoc?.(ydoc);

			// Initialize Epicenter database (wraps YJS with table/record API) if schema exists
			const db = epicenterConfig.schema
				? createEpicenterDb(ydoc, epicenterConfig.schema)
				: null;

			// Get index definitions from epicenter config by calling the indexes callback (if provided)
			// Support both sync and async indexes functions
			const indexes = epicenterConfig.indexes && db
				? await epicenterConfig.indexes({ db })
				: {};

			// Validate no duplicate index IDs (keys of returned object)
			const indexIds = Object.keys(indexes);
			if (new Set(indexIds).size !== indexIds.length) {
				throw new Error('Duplicate index IDs detected');
			}

			// Call the actions factory to get action definitions (if provided), passing:
			// - workspaceClients: initialized workspace clients (keyed by workspace name)
			// - db: Epicenter database API (if schema exists)
			// - indexes: exported resources from each index (db, queries, etc.)
			const actionMap = epicenterConfig.actions && db
				? epicenterConfig.actions({
						workspaces: workspaceClients,
						db,
						indexes,
					})
				: {};

			// Create cleanup function
			const cleanup = () => {
				// Clean up indexes first
				for (const index of Object.values(indexes)) {
					index.destroy?.();
				}

				// Clean up YDoc (disconnects providers, cleans up observers)
				ydoc?.destroy();
			};

			// Create the epicenter client with callable actions
			// Actions are already callable, no extraction needed
			const client: WorkspaceNamespace<any> = {
				...actionMap,
				destroy: cleanup,
			};

			return client;
		} else {
			// Pure composition epicenter: no features, just workspaces
			// Create a minimal client with only destroy method
			const client: WorkspaceNamespace<any> = {
				destroy: () => {
					// No cleanup needed for pure composition
				},
			};

			return client;
		}
	};

	// Initialize all epicenters in topological order
	for (const epicenterId of sorted) {
		const epicenterConfig = epicenterConfigs.get(epicenterId)!;
		const client = await initializeEpicenter(epicenterConfig);
		clients.set(epicenterId, client);
	}

	// Convert Map to typed object keyed by epicenter name (not id)
	const initializedEpicenters: Record<string, WorkspaceNamespace<WorkspaceActionMap>> = {};
	for (const [epicenterId, client] of clients) {
		const epicenterConfig = epicenterConfigs.get(epicenterId)!;
		initializedEpicenters[epicenterConfig.name] = client;
	}

	return initializedEpicenters as InitializedEpicenters<TConfigs>;
}

/**
 * Helper type that extracts the name and WorkspaceNamespace type for a single epicenter
 * Returns a single-entry object type: { [name]: WorkspaceNamespace<TActionMap> }
 */
type EpicenterToClientEntry<W> = W extends {
	name: infer TName extends string;
	actions?: (context: any) => infer TActionMap extends WorkspaceActionMap;
}
	? { [K in TName]: WorkspaceNamespace<TActionMap> }
	: never;

/**
 * Helper type that recursively processes a tuple of epicenters and merges them into a single object type
 * Distributes over each tuple element and combines all epicenter client entries
 */
type EpicentersToClientObject<WS extends readonly AnyEpicenterConfig[]> = WS extends readonly [
	infer First,
	...infer Rest extends readonly AnyEpicenterConfig[],
]
	? EpicenterToClientEntry<First> & EpicentersToClientObject<Rest>
	: {};

/**
 * Helper type that appends the root epicenter to the workspaces array for type inference
 * This ensures the root epicenter is included in EpicenterClient type
 */
type WithRoot<
	TWorkspaces extends readonly AnyEpicenterConfig[],
	TId extends string,
	TVersion extends number,
	TName extends string,
	TActionMap extends WorkspaceActionMap,
> = readonly [
	...TWorkspaces,
	{
		id: TId;
		version: TVersion;
		name: TName;
		actions?: (context: any) => TActionMap;
	},
];

/**
 * The main Epicenter client returned from `createEpicenterClient()`.
 *
 * This is a collection type where each epicenter is accessible by name as a namespace.
 * Each namespace (WorkspaceNamespace) contains that epicenter's actions plus a destroy method.
 *
 * @example
 * ```typescript
 * const client = await createEpicenterClient(myEpicenter);
 *
 * // Access epicenters by name - each is a WorkspaceNamespace
 * await client.epicenterName1.someAction();
 * await client.epicenterName2.anotherAction();
 *
 * // Global cleanup
 * client.destroy(); // destroys all epicenters
 * ```
 *
 * Structure:
 * ```
 * {
 *   epicenterName1: WorkspaceNamespace<ActionMap1>,
 *   epicenterName2: WorkspaceNamespace<ActionMap2>,
 *   ...
 *   destroy: () => void  // global destroy for all epicenters
 * }
 * ```
 */
export type EpicenterClient<TWorkspaces extends readonly AnyEpicenterConfig[]> =
	EpicentersToClientObject<TWorkspaces> & {
		/**
		 * Cleanup method for resource management
		 * Destroys all epicenters in this composition
		 */
		destroy: () => void;
	};

/**
 * Create an epicenter client with YJS-first architecture
 * Uses flat workspace resolution with VS Code-style peer dependency model
 * All transitive workspaces must be present in epicenter.workspaces (hoisted to root)
 * Initialization uses topological sort for deterministic, predictable order
 *
 * All epicenters are exposed by name in the returned client, making dependencies transparent.
 *
 * @param epicenter - Epicenter configuration to initialize
 * @returns Initialized client with all epicenters accessible by name
 *
 * @example
 * ```typescript
 * const client = await createEpicenterClient({
 *   id: 'content-platform',
 *   workspaces: [pages, contentHub]
 * });
 *
 * // Access epicenters by name
 * await client.pages.createPage({ title: 'Hello' });
 * await client.contentHub.createPost({ pageId: page.id });
 *
 * client.destroy();
 * ```
 */
export async function createEpicenterClient<
	const TWorkspaces extends readonly AnyEpicenterConfig[],
	const TId extends string,
	const TVersion extends number,
	const TName extends string,
	TWorkspaceSchema extends WorkspaceSchema,
	const TIndexMap extends WorkspaceIndexMap,
	TActionMap extends WorkspaceActionMap,
>(
	epicenter: EpicenterConfig<
		TWorkspaces,
		TId,
		TVersion,
		TName,
		TWorkspaceSchema,
		TIndexMap,
		TActionMap
	>,
): Promise<EpicenterClient<WithRoot<TWorkspaces, TId, TVersion, TName, TActionMap>>> {
	// Collect all epicenter configs (root + workspaces) for flat/hoisted initialization
	const allEpicenterConfigs: EpicenterConfig[] = [];

	// Add all workspaces first
	if (epicenter.workspaces) {
		// Workspaces are constrained to AnyEpicenterConfig at the type level to prevent
		// infinite recursion, but at runtime they're full EpicenterConfig objects
		allEpicenterConfigs.push(...(epicenter.workspaces as unknown as EpicenterConfig[]));
	}

	// Add root epicenter last (if it has schema/indexes/actions)
	if (epicenter.schema || epicenter.indexes || epicenter.actions) {
		allEpicenterConfigs.push(epicenter as unknown as EpicenterConfig);
	}

	// Use the shared initialization logic with flat workspace array
	const clients = await initializeEpicenters(allEpicenterConfigs);

	const cleanup = () => {
		for (const client of Object.values(clients) as Array<{ destroy: () => void }>) {
			client.destroy();
		}
	};

	// Return all epicenter clients by name
	return {
		...clients,
		destroy: cleanup,
	} as EpicenterClient<WithRoot<TWorkspaces, TId, TVersion, TName, TActionMap>>;
}
