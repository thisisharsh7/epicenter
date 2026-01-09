import * as Y from 'yjs';

/**
 * Create a Head Y.Doc wrapper for managing workspace epoch state.
 *
 * Each workspace has one Head Y.Doc that syncs with all collaborators.
 * It stores the current epoch number, which determines which Data Y.Doc to use.
 *
 * Y.Doc ID: `{workspaceId}` (no epoch suffix)
 *
 * ## CRDT-Safe Epoch Pattern
 *
 * Epochs use a **per-client MAX pattern** to handle concurrent bumps safely.
 * This is similar to the per-client counter pattern from [learn.yjs.dev](https://learn.yjs.dev/lessons/02-counter/),
 * but uses `max()` instead of `sum()` for version semantics.
 *
 * ### Why not a simple counter?
 *
 * A naive implementation would store a single `epoch: number`:
 *
 * ```typescript
 * // BAD: Concurrent bumps cause lost updates
 * setEpoch(epoch: number) {
 *   headMap.set('epoch', epoch);  // Overwrites other clients!
 * }
 * ```
 *
 * If two clients both read epoch=2 and set epoch=3 simultaneously,
 * one bump is silently lost (higher clientID wins in YJS).
 *
 * ### The solution: Per-client keys with MAX aggregation
 *
 * Each client writes to their own key (clientID), then we compute `max()`:
 *
 * ```
 * Y.Map('epochs')
 *   └── "1090160253": 3   // Client A proposed epoch 3
 *   └── "2847291038": 3   // Client B also proposed epoch 3
 *   └── "9182736450": 5   // Client C proposed epoch 5
 *
 * getEpoch() → max(3, 3, 5) → 5
 * ```
 *
 * ### Why MAX instead of SUM?
 *
 * - **SUM** (counter pattern): "How many total bumps happened?" → Can skip epochs
 * - **MAX** (version pattern): "What's the highest version proposed?" → No gaps
 *
 * Two clients bumping concurrently both propose "next version" (e.g., 3).
 * With MAX, they converge to epoch 3. With SUM, you'd get epoch 4 (skipping 3).
 *
 * Structure:
 * ```
 * Y.Map('epochs')
 *   └── {clientId}: number  // Each client's proposed epoch
 * ```
 *
 * @example
 * ```typescript
 * const head = createHeadDoc({ workspaceId: 'abc123xyz789012' });
 *
 * // Get current epoch (max of all client proposals)
 * const epoch = head.getEpoch(); // 0
 *
 * // Bump epoch safely (handles concurrent bumps)
 * const newEpoch = head.bumpEpoch(); // 1
 *
 * // Observe epoch changes (for reconnecting to new data doc)
 * const unsubscribe = head.observeEpoch((newEpoch) => {
 *   const dataDocId = `${head.workspaceId}-${newEpoch}`;
 *   // Reconnect to new data doc
 * });
 * ```
 *
 * @see https://learn.yjs.dev/lessons/02-counter/ - The counter pattern this is based on
 * @see skills/yjs/SKILL.md - Single-Writer Keys pattern documentation
 */
export function createHeadDoc(options: { workspaceId: string; ydoc?: Y.Doc }) {
	const { workspaceId } = options;
	const ydoc = options.ydoc ?? new Y.Doc({ guid: workspaceId });
	const epochsMap = ydoc.getMap<number>('epochs');

	/**
	 * Get the current epoch number.
	 *
	 * Computes the maximum of all client-proposed epochs.
	 * This ensures concurrent bumps converge to the same version
	 * without skipping epoch numbers.
	 *
	 * @returns The current epoch (0 if no bumps have occurred)
	 *
	 * @example
	 * ```typescript
	 * // Initial state
	 * head.getEpoch(); // 0
	 *
	 * // After some bumps
	 * head.bumpEpoch();
	 * head.getEpoch(); // 1
	 * ```
	 */
	function getEpoch(): number {
		let max = 0;
		for (const value of epochsMap.values()) {
			max = Math.max(max, value);
		}
		return max;
	}

	return {
		/** The underlying Y.Doc instance. */
		ydoc,

		/** The workspace ID (Y.Doc guid). */
		workspaceId,

		getEpoch,

		/**
		 * Get what THIS client has proposed as the epoch.
		 *
		 * This may be lower than `getEpoch()` if other clients have
		 * proposed higher epochs that we haven't bumped to yet.
		 *
		 * @returns This client's proposed epoch (0 if never bumped)
		 *
		 * @example
		 * ```typescript
		 * // Initial state
		 * head.getLocalEpoch(); // 0
		 * head.getEpoch();      // 0
		 *
		 * // After another client bumps to 5
		 * head.getLocalEpoch(); // 0 (we haven't bumped)
		 * head.getEpoch();      // 5 (max across all clients)
		 *
		 * // After we bump
		 * head.bumpEpoch();
		 * head.getLocalEpoch(); // 6
		 * head.getEpoch();      // 6
		 * ```
		 */
		getLocalEpoch(): number {
			return epochsMap.get(ydoc.clientID.toString()) ?? 0;
		},

		/**
		 * Bump the epoch to the next version.
		 *
		 * This is the **safe** way to increment epochs. It:
		 * 1. Reads the current max epoch
		 * 2. Proposes `max + 1` under this client's ID
		 * 3. Returns the new epoch
		 *
		 * **Concurrent safety**: If two clients bump simultaneously, they both
		 * propose the same "next" value (e.g., both propose 3). After sync,
		 * `getEpoch()` returns 3, not 4. No epochs are skipped.
		 *
		 * @returns The new epoch number after bumping
		 *
		 * @example
		 * ```typescript
		 * const head = createHeadDoc({ workspaceId: 'abc123' });
		 *
		 * // Client A bumps
		 * const epoch1 = head.bumpEpoch(); // 1
		 *
		 * // Client B bumps concurrently (before sync)
		 * // Both propose epoch 1, converge to 1 after sync
		 *
		 * // Sequential bump after sync
		 * const epoch2 = head.bumpEpoch(); // 2
		 * ```
		 */
		bumpEpoch(): number {
			const next = getEpoch() + 1;
			epochsMap.set(ydoc.clientID.toString(), next);
			return next;
		},

		/**
		 * Force set the epoch to a specific value.
		 *
		 * **Warning**: This bypasses the safe bump mechanism. Use only for:
		 * - Admin recovery operations
		 * - Restoring from a known state
		 * - Testing
		 *
		 * For normal epoch advancement, use `bumpEpoch()` instead.
		 *
		 * @param epoch - The epoch number to set
		 *
		 * @example
		 * ```typescript
		 * // Recovery: force all clients to epoch 5
		 * head.forceSetEpoch(5);
		 * ```
		 */
		forceSetEpoch(epoch: number) {
			epochsMap.set(ydoc.clientID.toString(), epoch);
		},

		/**
		 * Observe epoch changes.
		 *
		 * Fires when any client proposes a new epoch, which may change the
		 * max epoch. Use this to reconnect to the new Data Y.Doc.
		 *
		 * The callback receives the new max epoch (computed via `getEpoch()`).
		 *
		 * @param callback - Function called with the new epoch when it changes
		 * @returns Unsubscribe function
		 *
		 * @example
		 * ```typescript
		 * const unsubscribe = head.observeEpoch((newEpoch) => {
		 *   console.log(`Epoch changed to ${newEpoch}`);
		 *   const dataDocId = `${head.workspaceId}-${newEpoch}`;
		 *   // Reconnect to new data doc...
		 * });
		 *
		 * // Later: stop observing
		 * unsubscribe();
		 * ```
		 */
		observeEpoch(callback: (epoch: number) => void) {
			let lastEpoch = getEpoch();

			const handler = () => {
				const currentEpoch = getEpoch();
				if (currentEpoch !== lastEpoch) {
					lastEpoch = currentEpoch;
					callback(currentEpoch);
				}
			};

			epochsMap.observeDeep(handler);
			return () => epochsMap.unobserveDeep(handler);
		},

		/**
		 * Go to a specific epoch (forward or backward).
		 *
		 * Unlike `bumpEpoch()` which always increments, this allows setting
		 * any epoch value. Use for:
		 * - Time travel to a previous epoch
		 * - Rollbacks after a bad migration
		 * - Catching up to the current epoch
		 *
		 * **Note**: This sets YOUR client's proposal. Other clients may have
		 * different proposals, so `getEpoch()` returns `max()` of all proposals.
		 *
		 * @param epoch - The epoch number to go to
		 *
		 * @example
		 * ```typescript
		 * // Roll back to epoch 2
		 * head.goToEpoch(2);
		 *
		 * // Jump forward to epoch 10
		 * head.goToEpoch(10);
		 *
		 * // Catch up to the current max epoch
		 * head.goToEpoch(head.getEpoch());
		 * ```
		 */
		goToEpoch(epoch: number) {
			epochsMap.set(ydoc.clientID.toString(), epoch);
		},

		/**
		 * Get all client epoch proposals.
		 *
		 * Useful for debugging or understanding the epoch state across clients.
		 *
		 * @returns Map of clientId to their proposed epoch
		 *
		 * @example
		 * ```typescript
		 * const proposals = head.getEpochProposals();
		 * // Map { "1090160253" => 3, "2847291038" => 3 }
		 * ```
		 */
		getEpochProposals(): Map<string, number> {
			return new Map(epochsMap.entries());
		},

		/** Destroy the head doc and clean up resources. */
		destroy() {
			ydoc.destroy();
		},
	};
}

/** Head Y.Doc wrapper type - inferred from factory function. */
export type HeadDoc = ReturnType<typeof createHeadDoc>;
