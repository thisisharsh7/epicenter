import { defineWorkspace } from '@epicenter/hq';
import * as Y from 'yjs';
import { getRegistry, getHeadDoc } from '$lib/services/workspace-registry';
import { workspacePersistence } from '$lib/capabilities/tauri-persistence';
import { error } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';
import type { AppWorkspaceSchema } from '$lib/services/workspace-registry';

/**
 * Load a workspace lazily by GUID.
 *
 * This is a self-contained loader that doesn't depend on bootstrap or schema cache.
 * It loads the workspace directly from persistence when navigating to the route.
 *
 * Flow:
 * 1. Verify workspace exists in registry
 * 2. Get epoch from head doc
 * 3. Load workspace doc and extract schema
 * 4. Create workspace client
 */
export const load: LayoutLoad = async ({ params }) => {
	const workspaceId = params.id;
	console.log(`[Layout] Loading workspace: ${workspaceId}`);

	// Step 1: Verify workspace exists in registry
	const registry = await getRegistry();
	if (!registry.hasWorkspace(workspaceId)) {
		console.error(`[Layout] Workspace not found in registry: ${workspaceId}`);
		error(404, { message: `Workspace "${workspaceId}" not found` });
	}

	// Step 2: Get epoch from head doc
	const head = await getHeadDoc(workspaceId);
	const epoch = head.getEpoch();
	console.log(`[Layout] Workspace epoch: ${epoch}`);

	// Step 3: Load workspace doc and extract schema
	const schema = await loadWorkspaceSchema(workspaceId, epoch);
	console.log(`[Layout] Loaded schema: ${schema.name} (${schema.slug})`);

	// Step 4: Create workspace client
	const workspace = defineWorkspace(schema);
	const client = await workspace.create({
		epoch,
		capabilities: {
			persistence: (ctx: { ydoc: Y.Doc }) =>
				workspacePersistence(ctx.ydoc, workspaceId, epoch),
		},
	});

	// Wait for persistence to load existing data
	await client.capabilities.persistence.whenSynced;

	return {
		/** The workspace schema (id, slug, name, tables, kv). */
		workspace: schema,
		/** The live workspace client for CRUD operations. */
		client,
		/** The head doc for epoch management. */
		head,
		/** Current epoch this client is connected to. */
		epoch,
	};
};

/**
 * Load a workspace schema from its Y.Doc.
 *
 * Creates a temporary Y.Doc to read the schema, then destroys it.
 * The actual workspace client will be created separately with its own Y.Doc.
 */
async function loadWorkspaceSchema(
	workspaceId: string,
	epoch: number,
): Promise<AppWorkspaceSchema> {
	const docId = `${workspaceId}-${epoch}`;
	const ydoc = new Y.Doc({ guid: docId, gc: false });

	// Load from persistence
	const persistence = await workspacePersistence(ydoc, workspaceId, epoch);
	await persistence.whenSynced;

	// Extract schema from Y.Doc
	const metaMap = ydoc.getMap<string>('meta');
	const schemaMap = ydoc.getMap('schema');

	const name = metaMap.get('name') ?? 'Untitled';
	const slug = metaMap.get('slug') ?? workspaceId;

	// Extract tables from schema map
	const tablesYMap = schemaMap.get('tables') as
		| Y.Map<Y.Map<unknown>>
		| undefined;
	const tables: AppWorkspaceSchema['tables'] = {};

	if (tablesYMap) {
		for (const [tableName, tableMap] of tablesYMap.entries()) {
			const fieldsMap = tableMap.get('fields') as Y.Map<unknown> | undefined;
			const fields: Record<string, unknown> = {};

			if (fieldsMap) {
				for (const [fieldName, fieldDef] of fieldsMap.entries()) {
					fields[fieldName] = fieldDef;
				}
			}

			tables[tableName] = {
				name: (tableMap.get('name') as string) ?? tableName,
				icon:
					(tableMap.get(
						'icon',
					) as AppWorkspaceSchema['tables'][string]['icon']) ?? null,
				cover:
					(tableMap.get(
						'cover',
					) as AppWorkspaceSchema['tables'][string]['cover']) ?? null,
				description: (tableMap.get('description') as string) ?? '',
				fields: fields as AppWorkspaceSchema['tables'][string]['fields'],
			};
		}
	}

	// Extract KV from schema map
	const kvYMap = schemaMap.get('kv') as Y.Map<unknown> | undefined;
	const kv: AppWorkspaceSchema['kv'] = {};

	if (kvYMap) {
		for (const [key, value] of kvYMap.entries()) {
			kv[key] = value as AppWorkspaceSchema['kv'][string];
		}
	}

	// Clean up temporary Y.Doc
	persistence.destroy();
	ydoc.destroy();

	return {
		id: workspaceId,
		slug,
		name,
		tables,
		kv,
	};
}
