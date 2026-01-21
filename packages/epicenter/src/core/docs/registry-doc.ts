import * as Y from 'yjs';

import type {
	InferProviderExports,
	Lifecycle,
	ProviderFactoryMap,
} from './provider-types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Registry Doc
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a Registry Y.Doc wrapper for managing a user's workspace list.
 *
 * Each user has one Registry Y.Doc that syncs only across their own devices.
 * It stores a set of workspace IDs (not the workspace data itself).
 *
 * Y.Doc ID: `{registryId}` (from auth server)
 *
 * Structure:
 * ```
 * Y.Map('workspaces')
 *   └── {workspaceId}: true
 * ```
 *
 * @example
 * ```typescript
 * const registry = createRegistryDoc({
 *   registryId: 'xyz789012345abc',
 *   providers: {
 *     persistence: ({ ydoc }) => tauriPersistence(ydoc, ['registry']),
 *   },
 * });
 *
 * // Await sync before reading (persistence loads from disk)
 * await registry.whenSynced;
 *
 * // Add workspace to registry
 * registry.addWorkspace('abc123xyz789012');
 *
 * // Get all workspace IDs
 * const workspaceIds = registry.getWorkspaceIds();
 *
 * // Check if workspace exists
 * const exists = registry.hasWorkspace('abc123xyz789012');
 *
 * // Remove workspace from registry
 * registry.removeWorkspace('abc123xyz789012');
 *
 * // Observe changes
 * const unsubscribe = registry.observe((event) => {
 *   console.log('Added:', event.added);
 *   console.log('Removed:', event.removed);
 * });
 * ```
 */
export function createRegistryDoc<T extends ProviderFactoryMap>(options: {
	registryId: string;
	ydoc?: Y.Doc;
	providers: T;
}) {
	const { registryId, providers: providerFactories } = options;
	const ydoc = options.ydoc ?? new Y.Doc({ guid: registryId });
	const workspacesMap = ydoc.getMap<true>('workspaces');

	// Initialize providers synchronously — async work is in their whenSynced
	const providers = {} as InferProviderExports<T>;
	for (const [id, factory] of Object.entries(providerFactories)) {
		(providers as Record<string, unknown>)[id] = factory({ ydoc });
	}

	// Aggregate all provider whenSynced promises
	const whenSynced = Promise.all(
		Object.values(providers).map((p) => (p as Lifecycle).whenSynced),
	).then(() => {});

	return {
		/** The underlying Y.Doc instance. */
		ydoc,

		/** The registry ID (Y.Doc guid). */
		registryId,

		/** Provider exports. */
		providers,

		/** Resolves when all providers are synced. */
		whenSynced,

		/**
		 * Add a workspace to the registry.
		 *
		 * This marks that the user has access to this workspace.
		 * The workspace data itself lives in separate Head and Workspace Y.Docs.
		 */
		addWorkspace(workspaceId: string) {
			workspacesMap.set(workspaceId, true);
		},

		/**
		 * Remove a workspace from the registry.
		 *
		 * This removes the user's local reference to the workspace.
		 * It does NOT delete the workspace data (that requires auth server action).
		 */
		removeWorkspace(workspaceId: string) {
			workspacesMap.delete(workspaceId);
		},

		/** Check if a workspace is in the registry. */
		hasWorkspace(workspaceId: string) {
			return workspacesMap.has(workspaceId);
		},

		/** Get all workspace IDs in the registry. */
		getWorkspaceIds() {
			return Array.from(workspacesMap.keys());
		},

		/** Get the count of workspaces in the registry. */
		count() {
			return workspacesMap.size;
		},

		/**
		 * Observe changes to the workspace registry.
		 *
		 * Fires when workspaces are added or removed.
		 *
		 * @returns Unsubscribe function
		 */
		observe(callback: (event: { added: string[]; removed: string[] }) => void) {
			const handler = (
				event: Y.YMapEvent<true>,
				_transaction: Y.Transaction,
			) => {
				const added: string[] = [];
				const removed: string[] = [];

				event.changes.keys.forEach((change, key) => {
					if (change.action === 'add') {
						added.push(key);
					} else if (change.action === 'delete') {
						removed.push(key);
					}
				});

				if (added.length > 0 || removed.length > 0) {
					callback({ added, removed });
				}
			};

			workspacesMap.observe(handler);
			return () => workspacesMap.unobserve(handler);
		},

		/**
		 * Destroy providers and the underlying Y.Doc.
		 *
		 * Cleans up all provider resources before destroying the Y.Doc.
		 * Uses `allSettled` so one provider's destroy failure doesn't block others.
		 */
		async destroy() {
			await Promise.allSettled(
				Object.values(providers).map((p) => (p as Lifecycle).destroy()),
			);
			ydoc.destroy();
		},
	};
}

/** Registry Y.Doc wrapper type - inferred from factory function. */
export type RegistryDoc<T extends ProviderFactoryMap = ProviderFactoryMap> =
	ReturnType<typeof createRegistryDoc<T>>;
