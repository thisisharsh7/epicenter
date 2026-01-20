import { error } from '@sveltejs/kit';
import { createHead } from '$lib/docs/head';
import { readDefinition } from '$lib/docs/read-definition';
import { registry } from '$lib/docs/registry';
import { createWorkspaceClient } from '$lib/docs/workspace';
import type { LayoutLoad } from './$types';

/**
 * Load a workspace lazily by ID.
 *
 * Flow:
 * 1. Verify workspace exists in registry
 * 2. Get epoch from head doc
 * 3. Read definition from epoch folder ({epoch}/definition.json)
 * 4. Create client with the definition
 *
 * The definition is stored in the epoch folder by the unified persistence
 * capability, which writes it whenever Y.Map('definition') changes.
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

	// Step 2: Get epoch from head doc
	const head = createHead(workspaceId);
	await head.whenSynced;
	const epoch = head.getEpoch();
	console.log(`[Layout] Workspace epoch: ${epoch}`);

	// Step 3: Read definition from epoch folder
	const definition = await readDefinition(workspaceId, epoch);
	if (!definition) {
		console.error(
			`[Layout] Definition not found: ${workspaceId}/${epoch}/definition.json`,
		);
		error(404, {
			message: `Definition file not found for workspace "${workspaceId}" at epoch ${epoch}`,
		});
	}
	console.log(
		`[Layout] Loaded definition: ${definition.name} (${definition.id})`,
	);

	// Step 4: Create client with the definition
	const client = createWorkspaceClient(definition, epoch);

	// Wait for persistence to finish loading existing data from disk.
	await client.whenSynced;

	return {
		/** The workspace definition (id, name, tables, kv). */
		workspace: definition,
		/** The live workspace client for CRUD operations. */
		client,
		/** The head doc for epoch management. */
		head,
		/** Current epoch this client is connected to. */
		epoch,
	};
};
