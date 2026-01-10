import { createHeadDoc } from '@epicenter/hq';
import { persistYDocAsJson } from '$lib/providers/tauri-json-persistence';
import { persistYDoc } from '$lib/providers/tauri-persistence';

/**
 * Create a head doc with persistence for a workspace.
 *
 * The head doc stores the current epoch using a CRDT-safe per-client MAX pattern,
 * persisted to `{appLocalDataDir}/workspaces/{workspaceId}/head.yjs`.
 *
 * Uses the sync construction, async property pattern:
 * - Construction is synchronous (returns immediately)
 * - Async work tracked via `.whenSynced`
 * - UI awaits in workspace +layout.svelte render gate
 *
 * @example
 * ```typescript
 * // In route +layout.ts
 * const head = createHead('abc123xyz789012');
 * return { head };
 *
 * // In route +layout.svelte
 * {#await data.head.whenSynced}
 *   <Loading />
 * {:then}
 *   {@render children()}
 * {/await}
 * ```
 */
export function createHead(workspaceId: string) {
	return createHeadDoc({ workspaceId }).withProviders({
		persistence: (ctx) =>
			persistYDoc(ctx.ydoc, ['workspaces', workspaceId, 'head.yjs']),
		jsonPersistence: (ctx) =>
			persistYDocAsJson(ctx.ydoc, ['workspaces', workspaceId, 'head.json']),
	});
}
