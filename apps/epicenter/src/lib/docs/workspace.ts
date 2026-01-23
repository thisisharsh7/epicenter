import {
	createClient,
	type HeadDoc,
	type WorkspaceDefinition,
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
 * ## Static Definition Mode (Creating New Workspaces)
 *
 * When called with a definition, it is merged into Y.Map('definition').
 * Use this for creating new workspaces with a known definition.
 *
 * ```typescript
 * const definition: WorkspaceDefinition = { tables: {}, kv: {} };
 * const head = createHead(workspaceId);
 * await head.whenSynced;
 * head.setMeta({ name: 'My Workspace', icon: null, description: '' });
 * const client = createWorkspaceClient(head, definition);
 * await client.whenSynced;
 * ```
 *
 * ## Storage Layout
 *
 * ```
 * {appLocalDataDir}/workspaces/{workspaceId}/{epoch}/
 * ├── workspace.yjs      # Full Y.Doc binary (sync source of truth)
 * ├── definition.json    # Table/KV definitions from Y.Map('definition')
 * └── kv.json            # Settings from Y.Map('kv')
 * ```
 *
 * Note: Workspace identity (name, icon, description) lives in Head Doc's
 * Y.Map('meta'), not in the Workspace Doc.
 *
 * @param head - The HeadDoc containing workspace identity and current epoch
 * @param definition - Optional workspace definition (tables, kv) to seed. If omitted, definition loads from Y.Doc.
 * @returns A workspace client with persistence pre-configured
 */
export function createWorkspaceClient(
	head: HeadDoc,
	definition?: WorkspaceDefinition,
) {
	const builder = createClient(head);

	// If definition provided, use static definition mode; otherwise dynamic definition mode
	const configuredBuilder = definition
		? builder.withDefinition(definition)
		: builder;

	return configuredBuilder.withExtensions({
		persistence: (ctx) => workspacePersistence(ctx),
	});
}
