import { createSubscriber } from 'svelte/reactivity';
import type { Registry } from './registry';

/**
 * Wrap a Registry with Svelte 5 reactivity.
 *
 * All methods and properties pass through to the underlying Registry.
 * The only addition: `workspaceIds` and `count` become reactive getters that
 * automatically update when the underlying Y.Doc changes.
 *
 * Uses `createSubscriber` for lazy subscription management:
 * - Observer is only attached when `workspaceIds` or `count` is read in a reactive context
 * - Observer is automatically detached when no more reactive consumers exist
 *
 * @example
 * ```typescript
 * import { registry } from '$lib/docs/registry';
 * import { reactiveRegistry } from '$lib/docs/reactive-registry.svelte';
 *
 * const reactive = reactiveRegistry(registry);
 *
 * // In Svelte component - automatically reactive
 * $effect(() => {
 *   console.log('Workspaces:', reactive.workspaceIds);
 * });
 *
 * // Mutations work as expected
 * reactive.addWorkspace('new-workspace');  // Triggers the $effect above
 * ```
 */
export function reactiveRegistry(registryDoc: Registry) {
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

/** Reactive Registry wrapper type - inferred from factory function. */
export type ReactiveRegistry = ReturnType<typeof reactiveRegistry>;
