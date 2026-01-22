import type { RegistryDoc } from '@epicenter/hq';
import { createSubscriber } from 'svelte/reactivity';

/**
 * Wrap a RegistryDoc with Svelte 5 reactivity.
 *
 * All methods and properties pass through to the underlying RegistryDoc.
 * The only addition: `workspaceIds` and `count` become reactive getters that
 * automatically update when the underlying Y.Doc changes.
 *
 * Uses `createSubscriber` for lazy subscription management:
 * - Observer is only attached when `workspaceIds` or `count` is read in a reactive context
 * - Observer is automatically detached when no more reactive consumers exist
 *
 * @example
 * ```typescript
 * import { createRegistryDoc } from '@epicenter/hq';
 * import { reactiveRegistryDoc } from '$lib/docs/reactive-registry.svelte';
 *
 * const registry = reactiveRegistryDoc(
 *   createRegistryDoc({
 *     providers: { persistence: ({ ydoc }) => tauriPersistence(ydoc, ['registry']) },
 *   })
 * );
 *
 * // In Svelte component - automatically reactive
 * $effect(() => {
 *   console.log('Workspaces:', registry.workspaceIds);
 * });
 *
 * // Mutations work as expected
 * registry.addWorkspace('new-workspace');  // Triggers the $effect above
 * ```
 */
export function reactiveRegistryDoc<T extends RegistryDoc<any>>(
	registryDoc: T,
) {
	// Shadow state for reactive values
	let workspaceIds = $state(registryDoc.getWorkspaceIds());
	let count = $state(registryDoc.count());

	// Lazy subscription via createSubscriber
	const subscribe = createSubscriber((update) => {
		// Only attaches observer when someone reads workspaceIds/count in a reactive context
		const unsubscribe = registryDoc.observe(() => {
			workspaceIds = registryDoc.getWorkspaceIds();
			count = registryDoc.count();
			update(); // Signal Svelte that dependencies changed
		});
		return unsubscribe;
	});

	return {
		// Pass through everything from the original registryDoc
		...registryDoc,

		// Reactive getters (shadow the method-based API)
		get workspaceIds() {
			subscribe();
			return workspaceIds;
		},
		get count() {
			subscribe();
			return count;
		},
	};
}

/** Reactive RegistryDoc wrapper type - inferred from factory function. */
export type ReactiveRegistryDoc<T extends RegistryDoc<any>> = ReturnType<
	typeof reactiveRegistryDoc<T>
>;
