import { createRegistryDoc } from '@epicenter/hq';
import { persistYDoc } from '$lib/providers/tauri-persistence';

const REGISTRY_ID = 'local';

/**
 * Registry doc with persistence (singleton).
 *
 * The registry tracks which workspace GUIDs exist for this user,
 * persisted to `{appLocalDataDir}/registry.yjs`.
 *
 * Uses the sync construction, async property pattern:
 * - Construction is synchronous (returns immediately)
 * - Async work tracked via `.whenSynced`
 * - UI awaits in root +layout.svelte render gate
 *
 * @example
 * ```typescript
 * import { registry } from '$lib/docs/registry';
 *
 * // Sync access works immediately
 * registry.addWorkspace('abc123');
 * registry.getWorkspaceIds();
 *
 * // Await in UI render gate
 * {#await registry.whenSynced}
 *   <Loading />
 * {:then}
 *   {@render children()}
 * {/await}
 * ```
 */
export const registry = createRegistryDoc({
	registryId: REGISTRY_ID,
}).withProviders({
	persistence: (ctx) => persistYDoc(ctx.ydoc, 'registry.yjs'),
});
