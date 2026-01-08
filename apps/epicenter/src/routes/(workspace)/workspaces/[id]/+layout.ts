import { defineWorkspace, type TablesSchema } from '@epicenter/hq';
// Import browser-specific persistence (IndexedDB)
import { persistence } from '@epicenter/hq/capabilities/persistence/web';
import {
	readWorkspace,
	type WorkspaceFile,
} from '$lib/services/workspace-storage';
import { getTableFields } from '$lib/utils/normalize-table';
import { error } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';

/**
 * Convert TablesWithMetadata to TablesSchema by extracting just the fields.
 * This is needed because defineWorkspace expects raw field schemas,
 * but WorkspaceFile stores table definitions with metadata.
 */
function extractTablesSchema(workspace: WorkspaceFile): TablesSchema {
	const tables: TablesSchema = {};
	for (const [key, tableDef] of Object.entries(workspace.tables)) {
		const fields = getTableFields(tableDef);
		if (fields) {
			tables[key] = fields;
		}
	}
	return tables;
}

export const load: LayoutLoad = async ({ params }) => {
	const result = await readWorkspace(params.id);

	if (result.error) {
		error(404, { message: result.error.message });
	}

	const workspaceFile = result.data;

	// Extract just the field schemas for defineWorkspace
	const tablesSchema = extractTablesSchema(workspaceFile);

	// Create YJS-backed client with IndexedDB persistence
	const workspace = defineWorkspace({
		id: workspaceFile.id,
		guid: workspaceFile.guid,
		name: workspaceFile.name,
		tables: tablesSchema,
		kv: workspaceFile.kv,
	});

	const client = await workspace.create({ persistence });

	// Wait for IndexedDB to sync existing data
	await client.capabilities.persistence.whenSynced;

	return {
		workspace: workspaceFile,
		client,
	};
};
