import {
	createClient,
	type HeadDoc,
	type WorkspaceSchema,
} from '@epicenter/hq';
import { workspacePersistence } from './workspace-persistence';

/**
 * Create a workspace client with persistence.
 *
 * Supports two modes:
 *
 * ## Dynamic Schema Mode (Loading Existing Workspaces)
 *
 * When called without a schema, the client loads the schema from the Y.Doc.
 * Use this for loading existing workspaces where the schema is already persisted.
 *
 * ```typescript
 * const head = createHead(workspaceId);
 * await head.whenSynced;
 * const client = createWorkspaceClient(head);
 * await client.whenSynced;
 * ```
 *
 * ## Static Schema Mode (Creating New Workspaces)
 *
 * When called with a schema, the schema is merged into Y.Map('schema').
 * Use this for creating new workspaces with a known schema.
 *
 * ```typescript
 * const schema: WorkspaceSchema = { tables: {}, kv: {} };
 * const head = createHead(workspaceId);
 * await head.whenSynced;
 * head.setMeta({ name: 'My Workspace', icon: null, description: '' });
 * const client = createWorkspaceClient(head, schema);
 * await client.whenSynced;
 * ```
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
 * @param schema - Optional workspace schema (tables, kv) to seed. If omitted, schema loads from Y.Doc.
 * @returns A workspace client with persistence pre-configured
 */
export function createWorkspaceClient(head: HeadDoc, schema?: WorkspaceSchema) {
	const builder = createClient(head);

	// If schema provided, use static schema mode; otherwise dynamic schema mode
	const configuredBuilder = schema ? builder.withSchema(schema) : builder;

	return configuredBuilder.withExtensions({
		persistence: (ctx) => workspacePersistence(ctx.workspaceDoc),
	});
}
