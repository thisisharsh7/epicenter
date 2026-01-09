import { defineWorkspace } from '@epicenter/hq';
import { persistence } from '@epicenter/hq/capabilities/persistence/web';
import { readWorkspace } from '$lib/services/workspace-storage';
import { error } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ params }) => {
	const result = await readWorkspace(params.id);

	if (result.error) {
		error(404, { message: result.error.message });
	}

	const workspaceFile = result.data;

	// Pass full table definitions (with metadata) directly
	const workspace = defineWorkspace({
		id: workspaceFile.id,
		slug: workspaceFile.slug,
		name: workspaceFile.name,
		tables: workspaceFile.tables,
		kv: workspaceFile.kv,
	});

	const client = await workspace.create({ persistence });
	await client.capabilities.persistence.whenSynced;

	return { workspace: workspaceFile, client };
};
