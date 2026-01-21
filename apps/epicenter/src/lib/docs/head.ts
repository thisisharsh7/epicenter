import { createDynamicClient, createHeadDoc } from '@epicenter/hq';
import type * as Y from 'yjs';
import { tauriPersistence } from './persistence/tauri-persistence';
import { tauriWorkspacePersistence } from './persistence/tauri-workspace-persistence';

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
 * ## Fluent API
 *
 * The head doc provides a fluent chain to create workspace clients:
 *
 * ```typescript
 * // Dynamic schema mode (Epicenter app)
 * const client = registry.head(workspaceId).client();
 * await client.whenSynced;
 *
 * // Time travel (view historical epoch)
 * const client = registry.head(workspaceId).client({ epoch: 2 });
 * await client.whenSynced;
 * ```
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
	const baseHead = createHeadDoc({
		workspaceId,
		providers: {
			persistence: ({ ydoc }) =>
				tauriPersistence(ydoc, ['workspaces', workspaceId, 'head']),
		},
	});

	return {
		// Spread all base head properties and methods
		...baseHead,

		/**
		 * Create a WorkspaceClient for this workspace (fluent API).
		 *
		 * This is the bridge from Head Doc (Y.Doc #2) to Workspace Client (Y.Doc #3).
		 * The client's Y.Doc GUID is `{workspaceId}-{epoch}`.
		 *
		 * Uses dynamic schema mode: the schema comes from the Y.Doc, not from code.
		 * For static schema apps (like Whispering), use `createClient()` directly.
		 *
		 * @param options - Optional configuration
		 * @param options.epoch - Override epoch (default: head.getEpoch())
		 * @returns A WorkspaceClient with persistence pre-configured
		 *
		 * @example
		 * ```typescript
		 * // Fluent chain from registry
		 * const client = registry.head('my-workspace').client();
		 * await client.whenSynced;
		 *
		 * // Time travel to old epoch
		 * const oldClient = registry.head('my-workspace').client({ epoch: 2 });
		 * await oldClient.whenSynced;
		 * ```
		 */
		client({ epoch = baseHead.getEpoch() }: { epoch?: number } = {}) {
			return createDynamicClient(workspaceId, {
				epoch,
				capabilities: {
					persistence: (ctx: { ydoc: Y.Doc }) =>
						tauriWorkspacePersistence(ctx.ydoc, {
							workspaceId,
							epoch,
						}),
				},
			});
		},
	};
}
