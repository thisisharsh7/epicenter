import { createRegistryDoc } from '@epicenter/hq';
import { createHead } from './head';
import { tauriPersistence } from './persistence/tauri-persistence';

/**
 * Create the base registry doc with persistence.
 */
const baseRegistry = createRegistryDoc({
	providers: {
		persistence: ({ ydoc }) => tauriPersistence(ydoc, ['registry']),
	},
});

/**
 * Registry doc with persistence and fluent API (singleton).
 *
 * The registry tracks which workspace GUIDs exist for this user,
 * persisted to `{appLocalDataDir}/registry.yjs` with a JSON mirror
 * at `registry.json` for debugging.
 *
 * Uses the sync construction, async property pattern:
 * - Construction is synchronous (returns immediately)
 * - Async work tracked via `.whenSynced`
 * - UI awaits in root +layout.svelte render gate
 *
 * ## Fluent API
 *
 * The registry provides a fluent chain that mirrors the Y.Doc hierarchy:
 *
 * ```typescript
 * // Fluent chain: Registry → Head → Client
 * const client = registry.head(workspaceId).client();
 * await client.whenSynced;
 * ```
 *
 * @example
 * ```typescript
 * import { registry } from '$lib/docs/registry';
 *
 * // Sync access works immediately
 * registry.addWorkspace('abc123');
 * registry.getWorkspaceIds();
 *
 * // Fluent API for loading workspaces
 * const head = registry.head('abc123');
 * await head.whenSynced;
 * const epoch = head.getEpoch();
 *
 * // Await in UI render gate
 * {#await registry.whenSynced}
 *   <Loading />
 * {:then}
 *   {@render children()}
 * {/await}
 * ```
 */
export const registry = {
	// Spread all base registry properties and methods
	...baseRegistry,

	/**
	 * Get a HeadDoc for the given workspace (fluent API).
	 *
	 * This is the bridge from Registry (Y.Doc #1) to Head Doc (Y.Doc #2).
	 * The Head Doc tracks the current epoch for a workspace.
	 *
	 * @param workspaceId - The workspace ID to get the head for
	 * @returns A HeadDoc with persistence attached
	 * @throws Error if workspace doesn't exist in registry
	 *
	 * @example
	 * ```typescript
	 * // Fluent chain
	 * const head = registry.head('my-workspace');
	 * await head.whenSynced;
	 * const epoch = head.getEpoch();
	 *
	 * // Continue to client
	 * const client = head.client();
	 * await client.whenSynced;
	 * ```
	 */
	head(workspaceId: string) {
		// Validate workspace exists in registry
		if (!baseRegistry.hasWorkspace(workspaceId)) {
			throw new Error(
				`Workspace "${workspaceId}" not found in registry. ` +
					`Available workspaces: ${baseRegistry.getWorkspaceIds().join(', ') || '(none)'}`,
			);
		}

		return createHead(workspaceId);
	},
};
