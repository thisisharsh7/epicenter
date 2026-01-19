import { createClient, type WorkspaceDefinition } from '@epicenter/hq';
import type * as Y from 'yjs';
import { persistYDocAsJson } from '$lib/providers/tauri-json-persistence';
import { persistYDoc } from '$lib/providers/tauri-persistence';

/**
 * Create a workspace client with persistence for a given definition and epoch.
 *
 * This is the third step in the three-doc architecture:
 * 1. Registry → tracks which workspace GUIDs exist
 * 2. Head Doc → stores the current epoch for a workspace
 * 3. Workspace Doc → the actual definition and data (this function)
 *
 * This is a thin wrapper around `createClient()` that pre-configures
 * persistence capabilities. The workspace ID comes from `definition.id`.
 *
 * **Storage Layout (Epoch Folders):**
 * ```
 * {appLocalDataDir}/workspaces/{workspaceId}/{epoch}/
 * ├── workspace.yjs      # Full Y.Doc binary (sync source of truth)
 * ├── workspace.json     # Debug JSON mirror
 * └── (future: definition.json, kv.json, tables.sqlite)
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
	// Epoch folder structure: {workspaceId}/{epoch}/workspace.yjs
	const epochFolder = epoch.toString();

	return createClient(definition, {
		epoch,
		capabilities: {
			persistence: (ctx: { ydoc: Y.Doc }) =>
				persistYDoc(ctx.ydoc, [
					'workspaces',
					definition.id,
					epochFolder,
					'workspace.yjs',
				]),
			jsonPersistence: (ctx: { ydoc: Y.Doc }) =>
				persistYDocAsJson(ctx.ydoc, [
					'workspaces',
					definition.id,
					epochFolder,
					'workspace.json',
				]),
		},
	});
}
