import {
	createClient,
	type HeadDoc,
	type WorkspaceSchema,
} from '@epicenter/hq';
import type * as Y from 'yjs';
import { workspacePersistence } from './workspace-persistence';

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
 * | Static | `createWorkspaceClient(head, schema)` | Creating new workspaces |
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
 * @param head - The HeadDoc containing workspace identity and current epoch
 * @param schema - The workspace schema (tables, kv) to seed
 * @returns A workspace client with persistence pre-configured
 *
 * @example Creating a new workspace
 * ```typescript
 * const schema: WorkspaceSchema = {
 *   tables: {},
 *   kv: {},
 * };
 *
 * registry.addWorkspace(workspaceId);
 * // Set identity in Head Doc
 * const head = registry.head(workspaceId);
 * await head.whenSynced;
 * head.setMeta({ name: 'My Workspace', icon: null, description: '' });
 * // Create client with schema (head provides workspaceId and epoch)
 * const client = createWorkspaceClient(head, schema);
 * await client.whenSynced;
 * ```
 */
export function createWorkspaceClient(head: HeadDoc, schema: WorkspaceSchema) {
	const workspaceId = head.workspaceId;
	const epoch = head.getEpoch();

	return createClient(head)
		.withSchema(schema)
		.withExtensions({
			persistence: (ctx: { ydoc: Y.Doc }) =>
				workspacePersistence(ctx.ydoc, {
					workspaceId,
					epoch,
				}),
		});
}
