import { defineWorkspace } from '@epicenter/hq';
import * as Y from 'yjs';
import {
	getRegistry,
	getHeadDoc,
	extractSchemaFromYDoc,
} from '$lib/services/workspace-registry';
import { workspacePersistence } from '$lib/capabilities/tauri-persistence';
import { error } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';

/**
 * Load a workspace lazily by GUID.
 *
 * Uses the "empty schema" pattern: pass an empty schema to defineWorkspace,
 * let persistence load the real schema, then extract it from the Y.Doc.
 * This avoids creating a temporary Y.Doc just to read the schema.
 *
 * Flow:
 * 1. Verify workspace exists in registry
 * 2. Get epoch from head doc
 * 3. Create client with empty schema (persistence loads the real one)
 * 4. Extract schema from the loaded Y.Doc
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

	// Step 3: Create client with empty schema - persistence loads the real one
	const workspace = defineWorkspace({
		id: workspaceId,
		slug: workspaceId,
		name: '',
		tables: {},
		kv: {},
	});

	const client = await workspace.create({
		epoch,
		capabilities: {
			persistence: (ctx: { ydoc: Y.Doc }) =>
				workspacePersistence(ctx.ydoc, workspaceId, epoch),
		},
	});

	// Wait for persistence to load existing data
	await client.capabilities.persistence.whenSynced;

	// Step 4: Extract real schema from the loaded Y.Doc
	const schema = extractSchemaFromYDoc(client.ydoc, workspaceId);
	console.log(`[Layout] Loaded schema: ${schema.name} (${schema.slug})`);

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
