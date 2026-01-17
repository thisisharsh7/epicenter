import { error } from '@sveltejs/kit';
import { createHead } from '$lib/docs/head';
import { registry } from '$lib/docs/registry';
import { createWorkspaceClient } from '$lib/docs/workspace';
import { readDefinition } from '$lib/providers/definition-persistence';
import type { LayoutLoad } from './$types';

/**
 * Load a workspace lazily by GUID.
 *
 * Flow:
 * 1. Verify workspace exists in registry
 * 2. Read definition from definition.json (static metadata)
 * 3. Create head doc and get epoch
 * 4. Create client with the definition (Y.Doc stores DATA ONLY)
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

	// Step 2: Read definition from definition.json
	const definition = await readDefinition(workspaceId);
	if (!definition) {
		console.error(`[Layout] Definition file not found: ${workspaceId}`);
		error(404, {
			message: `Definition file not found for workspace "${workspaceId}"`,
		});
	}
	console.log(
		`[Layout] Loaded definition: ${definition.name} (${definition.slug})`,
	);

	// Step 3: Create head doc and get epoch
	const head = createHead(workspaceId);
	await head.whenSynced;
	const epoch = head.getEpoch();
	console.log(`[Layout] Workspace epoch: ${epoch}`);

	// Step 4: Create client with the definition
	// Y.Doc stores DATA ONLY (rows, kv values), not definition metadata
	const client = createWorkspaceClient(definition, epoch);

	// Wait for persistence to finish loading existing data from disk.
	// Once this resolves, the Y.Doc contains all previously saved row/kv data.
	await client.whenSynced;

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
