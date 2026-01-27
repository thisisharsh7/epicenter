import { createHeadDoc } from '@epicenter/hq';
import { headPersistence } from './head-persistence';

/**
 * Create a head doc with persistence for a workspace.
 *
 * The head doc stores the current epoch using a CRDT-safe per-client MAX pattern,
 * persisted to `{appLocalDataDir}/workspaces/{workspaceId}/head.yjs` with a JSON
 * mirror at `head.json` for debugging.
 *
 * Uses the sync construction, async property pattern:
 * - Construction is synchronous (returns immediately)
 * - Async work tracked via `.whenSynced`
 * - UI awaits in workspace +layout.svelte render gate
 *
 * @example
 * ```typescript
 * import { createHead } from '$lib/docs/head';
 * import { createWorkspaceClient } from '$lib/docs/workspace';
 *
 * // In route +layout.ts
 * const head = createHead('abc123xyz789012');
 * await head.whenSynced;
 *
 * // Create workspace client (dynamic schema mode)
 * const client = createWorkspaceClient(head);
 * await client.whenSynced;
 *
 * // Time travel (view historical epoch)
 * head.setOwnEpoch(2);
 * const oldClient = createWorkspaceClient(head);
 * await oldClient.whenSynced;
 * ```
 */
export function createHead(workspaceId: string) {
	return createHeadDoc({
		workspaceId,
		providers: {
			persistence: ({ ydoc }) => headPersistence(ydoc),
		},
	});
}
