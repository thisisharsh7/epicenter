import { error } from '@sveltejs/kit';
import { createHead } from '$lib/docs/head';
import { registry } from '$lib/docs/registry';
import { createWorkspaceClient } from '$lib/docs/workspace';
import { extractDefinitionFromYDoc } from '$lib/utils/extract-definition';
import type { LayoutLoad } from './$types';

/**
 * Load a workspace lazily by GUID.
 *
 * Uses the "empty definition" pattern: pass an empty definition to createWorkspaceClient,
 * let persistence load the real definition, then extract it from the Y.Doc.
 * This avoids creating a temporary Y.Doc just to read the definition.
 *
 * Flow:
 * 1. Verify workspace exists in registry
 * 2. Create head doc and get epoch
 * 3. Create client with empty definition (persistence loads the real one)
 * 4. Extract definition from the loaded Y.Doc
 */
export const load: LayoutLoad = async ({ params }) => {
	const workspaceId = params.id;
	console.log(`[Layout] Loading workspace: ${workspaceId}`);

	// Step 1: Verify workspace exists in registry
	// Await registry sync first - resolves immediately if already synced
	await registry.whenSynced;
	if (!registry.hasWorkspace(workspaceId)) {
		console.error(`[Layout] Workspace not found in registry: ${workspaceId}`);
		error(404, { message: `Workspace "${workspaceId}" not found` });
	}

	// Step 2: Create head doc and get epoch
	const head = createHead(workspaceId);
	await head.whenSynced;
	const epoch = head.getEpoch();
	console.log(`[Layout] Workspace epoch: ${epoch}`);

	// Step 3: Create client with empty definition - persistence loads the real one
	const client = createWorkspaceClient(
		{
			id: workspaceId,
			slug: workspaceId,
			name: '',
			tables: {},
			kv: {},
		},
		epoch,
	);

	// Wait for persistence to finish loading existing data from disk.
	// Once this resolves, the Y.Doc contains all previously saved state.
	await client.whenSynced;

	// Step 4: Extract real definition from the loaded Y.Doc
	const definition = extractDefinitionFromYDoc(client.ydoc, workspaceId);
	console.log(
		`[Layout] Loaded definition: ${definition.name} (${definition.slug})`,
	);

	return {
		/** The workspace definition (id, slug, name, tables, kv). */
		workspace: definition,
		/** The live workspace client for CRUD operations. */
		client,
		/** The head doc for epoch management. */
		head,
		/** Current epoch this client is connected to. */
		epoch,
	};
};
