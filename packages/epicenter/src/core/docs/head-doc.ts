import * as Y from 'yjs';

/**
 * Create a Head Y.Doc wrapper for managing workspace epoch state.
 *
 * Each workspace has one Head Y.Doc that syncs with all collaborators.
 * It stores the current epoch number, which determines which Data Y.Doc to use.
 *
 * Y.Doc ID: `{workspaceId}` (no epoch suffix)
 *
 * Structure:
 * ```
 * Y.Map('head')
 *   └── epoch: number
 * ```
 *
 * @example
 * ```typescript
 * const head = createHeadDoc({ workspaceId: 'abc123xyz789012' });
 *
 * // Get current epoch
 * const epoch = head.getEpoch(); // 0
 *
 * // Set epoch (for migrations)
 * head.setEpoch(1);
 *
 * // Observe epoch changes (for reconnecting to new data doc)
 * const unsubscribe = head.observeEpoch((newEpoch) => {
 *   const dataDocId = `${head.workspaceId}-${newEpoch}`;
 *   // Reconnect to new data doc
 * });
 * ```
 */
export function createHeadDoc(options: { workspaceId: string; ydoc?: Y.Doc }) {
	const { workspaceId } = options;
	const ydoc = options.ydoc ?? new Y.Doc({ guid: workspaceId });
	const headMap = ydoc.getMap<number>('head');

	// Initialize epoch to 0 if not set
	if (!headMap.has('epoch')) {
		headMap.set('epoch', 0);
	}

	function getEpoch(): number {
		return headMap.get('epoch') ?? 0;
	}

	return {
		/** The underlying Y.Doc instance. */
		ydoc,

		/** The workspace ID (Y.Doc guid). */
		workspaceId,

		/**
		 * Get the current epoch number.
		 *
		 * Epoch 0 is the initial epoch. Higher epochs indicate migrations.
		 */
		getEpoch,

		/**
		 * Set the epoch number.
		 *
		 * Use this to bump epochs or restore from a specific point.
		 * Clients observing epoch changes will be notified.
		 */
		setEpoch(epoch: number) {
			headMap.set('epoch', epoch);
		},

		/**
		 * Observe epoch changes.
		 *
		 * Fires when the epoch number changes, indicating clients
		 * should reconnect to a new Data Y.Doc at `{workspaceId}-{newEpoch}`.
		 *
		 * @returns Unsubscribe function
		 */
		observeEpoch(callback: (epoch: number) => void) {
			const handler = (
				event: Y.YMapEvent<number>,
				_transaction: Y.Transaction,
			) => {
				if (event.keysChanged.has('epoch')) {
					callback(getEpoch());
				}
			};

			headMap.observe(handler);
			return () => headMap.unobserve(handler);
		},

		/** Destroy the head doc and clean up resources. */
		destroy() {
			ydoc.destroy();
		},
	};
}

/** Head Y.Doc wrapper type - inferred from factory function. */
export type HeadDoc = ReturnType<typeof createHeadDoc>;
