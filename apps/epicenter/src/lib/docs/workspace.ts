import { createClient, type WorkspaceDefinition } from '@epicenter/hq';
import type * as Y from 'yjs';
import { tauriWorkspacePersistence } from './persistence/tauri-workspace-persistence';

/**
 * Create a workspace client with persistence for a given definition and epoch.
 *
 * This is the third step in the three-doc architecture:
 * 1. Registry → tracks which workspace GUIDs exist
 * 2. Head Doc → stores the current epoch for a workspace
 * 3. Workspace Doc → the actual definition and data (this function)
 *
 * This is a thin wrapper around `createClient()` that pre-configures
 * unified persistence capabilities. The workspace ID comes from `definition.id`.
 *
 * **Storage Layout (Epoch Folders):**
 * ```
 * {appLocalDataDir}/workspaces/{workspaceId}/{epoch}/
 * ├── workspace.yjs      # Full Y.Doc binary (sync source of truth)
 * ├── definition.json    # Schema from Y.Map('definition')
 * ├── kv.json            # Settings from Y.Map('kv')
 * └── snapshots/         # Revision history (future)
 *     └── {unix-ms}.ysnap
 * ```
 *
 * @param definition - The workspace definition (id, name, tables, kv)
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
	return createClient(definition, {
		epoch,
		capabilities: {
			persistence: (ctx: { ydoc: Y.Doc }) =>
				tauriWorkspacePersistence(ctx.ydoc, {
					workspaceId: definition.id,
					epoch,
				}),
		},
	});
}
