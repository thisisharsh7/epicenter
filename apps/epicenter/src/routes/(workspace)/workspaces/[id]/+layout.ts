import { defineWorkspace, type TablesSchema } from '@epicenter/hq';
import { persistence } from '@epicenter/hq/capabilities/persistence/web';
import { readWorkspace } from '$lib/services/workspace-storage';
import { getTableFields } from '$lib/utils/normalize-table';
import { error } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ params }) => {
	const result = await readWorkspace(params.id);

	if (result.error) {
		error(404, { message: result.error.message });
	}

	const workspaceFile = result.data;

	// Extract fields from TablesWithMetadata → TablesSchema
	const tables: TablesSchema = {};
	for (const [key, tableDef] of Object.entries(workspaceFile.tables)) {
		const fields = getTableFields(tableDef);
		if (fields) tables[key] = fields;
	}

	const workspace = defineWorkspace({
		id: workspaceFile.id,
		slug: workspaceFile.slug,
		name: workspaceFile.name,
		tables,
		kv: workspaceFile.kv,
	});

	const client = await workspace.create({ persistence });
	await client.capabilities.persistence.whenSynced;

	return { workspace: workspaceFile, client };
};
