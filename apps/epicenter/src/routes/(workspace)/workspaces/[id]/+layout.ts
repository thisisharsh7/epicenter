import { error } from '@sveltejs/kit';
import { registry } from '$lib/docs/registry';
import type { LayoutLoad } from './$types';

/**
 * Load a workspace lazily by ID using the fluent API.
 *
 * Flow:
 * 1. Verify workspace exists in registry
 * 2. Create client via fluent chain: registry.head(id).client()
 * 3. Client loads schema from Y.Doc (dynamic schema mode)
 *
 * This eliminates the need to read schema.json from disk.
 * The schema lives in Y.Map('schema') inside the Y.Doc itself.
 * Workspace identity (name, icon) comes from Head Doc's Y.Map('meta').
 */
export const load: LayoutLoad = async ({ params }) => {
	const workspaceId = params.id;
	console.log(`[Layout] Loading workspace: ${workspaceId}`);

	// Step 1: Verify workspace exists in registry
	await registry.whenSynced;
	if (!registry.hasWorkspace(workspaceId)) {
		console.error(`[Layout] Workspace not found in registry: ${workspaceId}`);
		error(404, { message: `Workspace "${workspaceId}" not found` });
	}

	// Step 2: Get head doc via fluent API (validates workspace exists)
	const head = registry.head(workspaceId);
	await head.whenSynced;
	const epoch = head.getEpoch();
	console.log(`[Layout] Workspace epoch: ${epoch}`);

	// Step 3: Create client via fluent API (dynamic schema mode)
	// Schema comes from Y.Doc, not from schema.json file
	const client = head.client();
	await client.whenSynced;

	// Get workspace name from Head Doc's meta (not from client)
	const meta = head.getMeta();
	console.log(`[Layout] Loaded workspace: ${meta.name} (${client.id})`);

	return {
		/** The live workspace client for CRUD operations. */
		client,
		/** The head doc for epoch management. */
		head,
		/** Current epoch this client is connected to. */
		epoch,
	};
};
