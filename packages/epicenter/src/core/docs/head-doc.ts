import * as Y from 'yjs';

/**
 * Head Y.Doc wrapper - Pointer to the current data epoch for a workspace.
 *
 * Each workspace has one Head Y.Doc that syncs with all collaborators.
 * It stores the current epoch number, which determines which Data Y.Doc to use.
 *
 * Y.Doc ID: `{workspaceId}` (no epoch suffix)
 *
 * Structure:
 * ```
 * Y.Map('head')
 *   ├── epoch: number (currently always 0)
 *   └── isMigrating: boolean (optional, for epoch bump coordination)
 * ```
 */
export type HeadDoc = {
	/** The underlying Y.Doc instance. */
	ydoc: Y.Doc;
	/** The workspace ID (Y.Doc guid). */
	workspaceId: string;

	/**
	 * Get the current epoch number.
	 *
	 * Epoch 0 is the initial epoch. Higher epochs indicate migrations.
	 */
	getEpoch(): number;

	/**
	 * Get the Y.Doc ID for the current data document.
	 *
	 * Format: `{workspaceId}-{epoch}`
	 */
	getDataDocId(): string;

	/**
	 * Check if a migration is currently in progress.
	 *
	 * When true, clients should avoid writes until migration completes.
	 */
	isMigrating(): boolean;

	/**
	 * Start a migration to a new epoch.
	 *
	 * This sets `isMigrating = true` to signal other clients.
	 * Call `completeEpochBump()` after migration is done.
	 *
	 * @returns The new epoch number
	 */
	startEpochBump(): number;

	/**
	 * Complete an epoch bump and update to the new epoch.
	 *
	 * Call this after data has been migrated to the new Data Y.Doc.
	 */
	completeEpochBump(newEpoch: number): void;

	/**
	 * Cancel an in-progress epoch bump.
	 *
	 * Use this if migration fails and you need to abort.
	 */
	cancelEpochBump(): void;

	/**
	 * Observe epoch changes.
	 *
	 * This fires when the epoch number changes, indicating clients
	 * should reconnect to a new Data Y.Doc.
	 *
	 * @returns Unsubscribe function
	 */
	observeEpoch(callback: (epoch: number) => void): () => void;

	/**
	 * Observe migration status changes.
	 *
	 * @returns Unsubscribe function
	 */
	observeMigrating(callback: (isMigrating: boolean) => void): () => void;

	/** Destroy the head doc and clean up resources. */
	destroy(): void;
};

/**
 * Create a Head Y.Doc wrapper for managing workspace epoch state.
 *
 * @example
 * ```typescript
 * const head = createHeadDoc({ workspaceId: 'abc123xyz789012' });
 *
 * // Get current epoch
 * const epoch = head.getEpoch(); // 0
 *
 * // Get data doc ID
 * const dataDocId = head.getDataDocId(); // 'abc123xyz789012-0'
 *
 * // Observe epoch changes (for reconnecting to new data doc)
 * const unsubscribe = head.observeEpoch((newEpoch) => {
 *   console.log('Epoch changed to:', newEpoch);
 *   // Reconnect to new data doc
 * });
 * ```
 */
export function createHeadDoc(options: {
	workspaceId: string;
	ydoc?: Y.Doc;
}): HeadDoc {
	const { workspaceId } = options;
	const ydoc = options.ydoc ?? new Y.Doc({ guid: workspaceId });
	const headMap = ydoc.getMap<number | boolean>('head');

	// Initialize epoch to 0 if not set
	if (!headMap.has('epoch')) {
		headMap.set('epoch', 0);
	}

	function getEpoch(): number {
		return (headMap.get('epoch') as number) ?? 0;
	}

	function isMigrating(): boolean {
		return (headMap.get('isMigrating') as boolean) ?? false;
	}

	return {
		ydoc,
		workspaceId,

		getEpoch,

		getDataDocId() {
			return `${workspaceId}-${getEpoch()}`;
		},

		isMigrating,

		startEpochBump() {
			const currentEpoch = getEpoch();
			const newEpoch = currentEpoch + 1;

			ydoc.transact(() => {
				headMap.set('isMigrating', true);
			});

			return newEpoch;
		},

		completeEpochBump(newEpoch) {
			ydoc.transact(() => {
				headMap.set('epoch', newEpoch);
				headMap.delete('isMigrating');
			});
		},

		cancelEpochBump() {
			headMap.delete('isMigrating');
		},

		observeEpoch(callback) {
			const handler = (
				event: Y.YMapEvent<number | boolean>,
				_transaction: Y.Transaction,
			) => {
				if (event.keysChanged.has('epoch')) {
					callback(getEpoch());
				}
			};

			headMap.observe(handler);
			return () => headMap.unobserve(handler);
		},

		observeMigrating(callback) {
			const handler = (
				event: Y.YMapEvent<number | boolean>,
				_transaction: Y.Transaction,
			) => {
				if (event.keysChanged.has('isMigrating')) {
					callback(isMigrating());
				}
			};

			headMap.observe(handler);
			return () => headMap.unobserve(handler);
		},

		destroy() {
			ydoc.destroy();
		},
	};
}
