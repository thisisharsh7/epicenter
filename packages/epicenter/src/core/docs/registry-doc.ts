import * as Y from 'yjs';

/**
 * Registry Y.Doc wrapper - Personal index of workspaces the user has access to.
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
 */
export type RegistryDoc = {
	/** The underlying Y.Doc instance. */
	ydoc: Y.Doc;
	/** The registry ID (Y.Doc guid). */
	registryId: string;

	/**
	 * Add a workspace to the registry.
	 *
	 * This marks that the user has access to this workspace.
	 * The workspace data itself lives in separate Head and Data Y.Docs.
	 */
	addWorkspace(workspaceId: string): void;

	/**
	 * Remove a workspace from the registry.
	 *
	 * This removes the user's local reference to the workspace.
	 * It does NOT delete the workspace data (that requires auth server action).
	 */
	removeWorkspace(workspaceId: string): void;

	/** Check if a workspace is in the registry. */
	hasWorkspace(workspaceId: string): boolean;

	/** Get all workspace IDs in the registry. */
	getWorkspaceIds(): string[];

	/** Get the count of workspaces in the registry. */
	count(): number;

	/**
	 * Observe changes to the workspace registry.
	 *
	 * Fires when workspaces are added or removed.
	 *
	 * @returns Unsubscribe function
	 */
	observe(
		callback: (event: { added: string[]; removed: string[] }) => void,
	): () => void;

	/** Destroy the registry doc and clean up resources. */
	destroy(): void;
};

/**
 * Create a Registry Y.Doc wrapper for managing a user's workspace list.
 *
 * @example
 * ```typescript
 * const registry = createRegistryDoc({ registryId: 'xyz789012345abc' });
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
export function createRegistryDoc(options: {
	registryId: string;
	ydoc?: Y.Doc;
}): RegistryDoc {
	const { registryId } = options;
	const ydoc = options.ydoc ?? new Y.Doc({ guid: registryId });
	const workspacesMap = ydoc.getMap<true>('workspaces');

	return {
		ydoc,
		registryId,

		addWorkspace(workspaceId) {
			workspacesMap.set(workspaceId, true);
		},

		removeWorkspace(workspaceId) {
			workspacesMap.delete(workspaceId);
		},

		hasWorkspace(workspaceId) {
			return workspacesMap.has(workspaceId);
		},

		getWorkspaceIds() {
			return Array.from(workspacesMap.keys());
		},

		count() {
			return workspacesMap.size;
		},

		observe(callback) {
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

		destroy() {
			ydoc.destroy();
		},
	};
}
