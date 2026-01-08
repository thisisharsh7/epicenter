import { ensureWorkspaceClient } from '$lib/workspace-client';
import { error } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ params }) => {
	try {
		const { workspace, client } = await ensureWorkspaceClient(params.id);
		return { workspace, client };
	} catch (e) {
		error(404, {
			message: e instanceof Error ? e.message : 'Workspace not found',
		});
	}
};
