import { createClient, type WorkspaceDefinition } from '@epicenter/hq';
import type * as Y from 'yjs';
import { tauriWorkspacePersistence } from './persistence/tauri-workspace-persistence';

/**
 * Create a workspace client with persistence (static schema mode).
 *
 * **Use this for creating NEW workspaces** where you have a known definition
 * to seed into the Y.Doc. The definition is merged into Y.Map('definition')
 * after persistence loads.
 *
 * **For loading EXISTING workspaces**, use the fluent API instead:
 * ```typescript
 * const client = registry.head(workspaceId).client();
 * await client.whenSynced;
 * ```
 *
 * ## Static vs Dynamic Schema Mode
 *
 * | Mode | Function | Use Case |
 * |------|----------|----------|
 * | Static | `createWorkspaceClient(definition, epoch)` | Creating new workspaces |
 * | Dynamic | `registry.head(id).client()` | Loading existing workspaces |
 *
 * ## Storage Layout
 *
 * ```
 * {appLocalDataDir}/workspaces/{workspaceId}/{epoch}/
 * ├── workspace.yjs      # Full Y.Doc binary (sync source of truth)
 * ├── definition.json    # Schema from Y.Map('definition')
 * └── kv.json            # Settings from Y.Map('kv')
 * ```
 *
 * @param definition - The workspace definition (id, name, tables, kv) to seed
 * @param epoch - The epoch number (usually 0 for new workspaces)
 * @returns A workspace client with persistence pre-configured
 *
 * @example Creating a new workspace
 * ```typescript
 * const definition: WorkspaceDefinition = {
 *   id: 'my-workspace',
 *   name: 'My Workspace',
 *   tables: {},
 *   kv: {},
 * };
 *
 * registry.addWorkspace(definition.id);
 * const client = createWorkspaceClient(definition, 0);
 * await client.whenSynced;
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
