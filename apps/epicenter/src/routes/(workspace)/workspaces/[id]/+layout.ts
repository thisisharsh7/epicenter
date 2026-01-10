import { defineWorkspace } from '@epicenter/hq';
import { error } from '@sveltejs/kit';
import * as Y from 'yjs';
import { createHead } from '$lib/docs/head';
import { registry } from '$lib/docs/registry';
import { persistYDoc } from '$lib/providers/tauri-persistence';
import { extractSchemaFromYDoc } from '$lib/utils/extract-schema';
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
 * 2. Create head doc and get epoch
 * 3. Create client with empty schema (persistence loads the real one)
 * 4. Extract schema from the loaded Y.Doc
 */
export const load: LayoutLoad = async ({ params }) => {
	const workspaceId = params.id;
	console.log(`[Layout] Loading workspace: ${workspaceId}`);

	// Step 1: Verify workspace exists in registry
	// Registry is already synced (root layout awaits whenSynced)
	if (!registry.hasWorkspace(workspaceId)) {
		console.error(`[Layout] Workspace not found in registry: ${workspaceId}`);
		error(404, { message: `Workspace "${workspaceId}" not found` });
	}

	// Step 2: Create head doc and get epoch
	const head = createHead(workspaceId);
	await head.whenSynced;
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

	const client = workspace.create({
		epoch,
		capabilities: {
			persistence: (ctx: { ydoc: Y.Doc }) =>
				persistYDoc(ctx.ydoc, `workspaces/${workspaceId}/${epoch}.yjs`),
		},
	});

	// Wait for persistence to finish loading existing data from disk.
	// Once this resolves, the Y.Doc contains all previously saved state.
	await client.whenSynced;

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
