import type { HeadDoc } from '@epicenter/hq';
import { createSubscriber } from 'svelte/reactivity';

/**
 * Wrap a HeadDoc with Svelte 5 reactivity.
 *
 * All methods and properties pass through to the underlying HeadDoc.
 * The only addition: `epoch` and `ownEpoch` become reactive getters that
 * automatically update when the underlying Y.Doc changes.
 *
 * Uses `createSubscriber` for lazy subscription management:
 * - Observer is only attached when `epoch` or `ownEpoch` is read in a reactive context
 * - Observer is automatically detached when no more reactive consumers exist
 *
 * @example
 * ```typescript
 * import { createHeadDoc } from '@epicenter/hq';
 * import { reactiveHeadDoc } from '$lib/docs/reactive-head.svelte';
 *
 * const head = reactiveHeadDoc(
 *   createHeadDoc({
 *     workspaceId: 'abc123',
 *     providers: { persistence: ({ ydoc }) => tauriPersistence(ydoc, ['head']) },
 *   })
 * );
 *
 * // In Svelte component - automatically reactive
 * $effect(() => {
 *   console.log('Epoch changed:', head.epoch);
 * });
 *
 * // Mutations work as expected
 * head.bumpEpoch();  // Triggers the $effect above
 * ```
 */
export function reactiveHeadDoc<T extends HeadDoc<any>>(headDoc: T) {
	// Shadow state for reactive values
	let epoch = $state(headDoc.getEpoch());
	let ownEpoch = $state(headDoc.getOwnEpoch());

	// Lazy subscription via createSubscriber
	const subscribe = createSubscriber((update) => {
		// Only attaches observer when someone reads epoch/ownEpoch in a reactive context
		const unsubscribe = headDoc.observeEpoch((newEpoch) => {
			epoch = newEpoch;
			ownEpoch = headDoc.getOwnEpoch();
			update(); // Signal Svelte that dependencies changed
		});
		return unsubscribe;
	});

	return {
		// Pass through everything from the original headDoc
		...headDoc,

		// Reactive getters (shadow the method-based API)
		get epoch() {
			subscribe();
			return epoch;
		},
		get ownEpoch() {
			subscribe();
			return ownEpoch;
		},
	};
}

/** Reactive HeadDoc wrapper type - inferred from factory function. */
export type ReactiveHeadDoc<T extends HeadDoc<any>> = ReturnType<
	typeof reactiveHeadDoc<T>
>;
