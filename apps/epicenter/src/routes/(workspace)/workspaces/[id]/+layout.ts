import { defineWorkspace } from '@epicenter/hq';
import type * as Y from 'yjs';
import {
	getHeadDoc,
	getWorkspaceSchema,
	findWorkspaceBySlug,
} from '$lib/services/workspace-registry';
import { bootstrap } from '$lib/services/bootstrap';
import { workspacePersistence } from '$lib/capabilities/tauri-persistence';
import { error } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';

/**
 * Load a workspace using the three-fetch pattern:
 *
 * 1. Ensure bootstrap has completed (loads registry and schema cache)
 * 2. Find workspace schema by slug (from URL param)
 * 3. Get epoch from head doc
 * 4. Create workspace client at that epoch
 */
export const load: LayoutLoad = async ({ params }) => {
	// Ensure bootstrap has completed before accessing the schema cache
	// This handles the case where the user reloads the page directly on a workspace URL
	await bootstrap();

	console.log(`[Layout] Loading workspace: ${params.id}`);

	// Step 1: Find workspace by slug (params.id is the slug from URL)
	// Also try GUID lookup in case someone navigates with GUID directly
	const schemaBySlug = findWorkspaceBySlug(params.id);
	const schemaByGuid = getWorkspaceSchema(params.id);
	const schema = schemaBySlug ?? schemaByGuid;

	console.log(`[Layout] Schema by slug:`, schemaBySlug?.slug);
	console.log(`[Layout] Schema by GUID:`, schemaByGuid?.slug);

	if (!schema) {
		console.error(`[Layout] Workspace not found: ${params.id}`);
		error(404, { message: `Workspace "${params.id}" not found` });
	}

	console.log(`[Layout] Found schema:`, schema.name, schema.slug);

	// Step 2: Get epoch from Head Doc
	const head = await getHeadDoc(schema.id);
	const epoch = head.getEpoch();

	// Step 3: Create client at this epoch
	const workspace = defineWorkspace(schema);
	const client = await workspace.create({
		epoch,
		capabilities: {
			persistence: (ctx: { ydoc: Y.Doc }) =>
				workspacePersistence(ctx.ydoc, schema.id, epoch),
		},
	});

	// Wait for persistence to load existing data
	await client.capabilities.persistence.whenSynced;

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
