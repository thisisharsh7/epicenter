import { createClient, type WorkspaceDefinition } from '@epicenter/hq';
import type * as Y from 'yjs';
import { tauriWorkspacePersistence } from './persistence/tauri-workspace-persistence';

/**
 * Create a workspace client with persistence (static schema mode).
 *
 * **Use this for creating NEW workspaces** where you have a known schema
 * to seed into the Y.Doc. The schema is merged into Y.Map('schema')
 * after persistence loads. Workspace identity (name, icon) should be
 * set separately via Head Doc's setMeta().
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
 * ├── schema.json        # Table/KV schemas from Y.Map('schema')
 * └── kv.json            # Settings from Y.Map('kv')
 * ```
 *
 * Note: Workspace identity (name, icon, description) lives in Head Doc's
 * Y.Map('meta'), not in the Workspace Doc.
 *
 * @param definition - The workspace definition (id, tables, kv) to seed
 * @param epoch - The epoch number (usually 0 for new workspaces)
 * @returns A workspace client with persistence pre-configured
 *
 * @example Creating a new workspace
 * ```typescript
 * const definition: WorkspaceDefinition = {
 *   id: 'my-workspace',
 *   tables: {},
 *   kv: {},
 * };
 *
 * registry.addWorkspace(definition.id);
 * // Set identity in Head Doc
 * const head = registry.head(definition.id);
 * await head.whenSynced;
 * head.setMeta({ name: 'My Workspace', icon: null, description: '' });
 * // Create client with schema
 * const client = createWorkspaceClient(definition, 0);
 * await client.whenSynced;
 * ```
 */
export function createWorkspaceClient(
	definition: WorkspaceDefinition,
	epoch: number,
) {
	return createClient(definition.id, { epoch })
		.withDefinition(definition)
		.withExtensions({
			persistence: (ctx: { ydoc: Y.Doc }) =>
				tauriWorkspacePersistence(ctx.ydoc, {
					workspaceId: definition.id,
					epoch,
				}),
		});
}
