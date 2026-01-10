import { defineWorkspace, type WorkspaceDefinition } from '@epicenter/hq';
import * as Y from 'yjs';
import { persistYDoc } from '$lib/providers/tauri-persistence';

/**
 * Create a workspace client with persistence for a given definition and epoch.
 *
 * This is the third step in the three-doc architecture:
 * 1. Registry → tracks which workspace GUIDs exist
 * 2. Head Doc → stores the current epoch for a workspace
 * 3. Workspace Doc → the actual definition and data (this function)
 *
 * Combines `defineWorkspace()` and `.create()` into a single call with
 * standardized capabilities. The workspace ID comes from `definition.id`.
 *
 * Persisted to `{appLocalDataDir}/workspaces/{workspaceId}/{epoch}.yjs`.
 *
 * @param definition - The workspace definition (id, slug, name, tables, kv)
 * @param epoch - The epoch number from the head doc
 * @returns A workspace client with persistence pre-configured
 *
 * @example
 * ```typescript
 * // Get epoch from head doc
 * const head = createHead(workspaceId);
 * await head.whenSynced;
 * const epoch = head.getEpoch();
 *
 * // Create workspace client
 * const client = createWorkspaceClient(definition, epoch);
 * await client.whenSynced;
 *
 * // Use the client
 * client.tables.myTable.insert({ ... });
 * ```
 */
export function createWorkspaceClient(
	definition: WorkspaceDefinition,
	epoch: number,
) {
	const workspace = defineWorkspace(definition);
	return workspace.create({
		epoch,
		capabilities: {
			persistence: (ctx: { ydoc: Y.Doc }) =>
				persistYDoc(ctx.ydoc, ['workspaces', definition.id, `${epoch}.yjs`]),
		},
	});
}
