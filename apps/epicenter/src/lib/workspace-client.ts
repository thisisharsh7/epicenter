import {
	defineWorkspace,
	type TablesSchema,
	type WorkspaceClient,
} from '@epicenter/hq';
import { persistence } from '@epicenter/hq/capabilities/persistence/web';
import {
	readWorkspace,
	type WorkspaceFile,
} from '$lib/services/workspace-storage';
import { getTableFields } from '$lib/utils/normalize-table';

type ActiveWorkspace = {
	id: string;
	workspace: WorkspaceFile;
	client: WorkspaceClient;
};

let current: ActiveWorkspace | null = null;

/**
 * Load or reuse a workspace client.
 */
export async function ensureWorkspaceClient(
	workspaceId: string,
): Promise<ActiveWorkspace> {
	if (current?.id === workspaceId) {
		return current;
	}

	if (current) {
		await current.client.destroy();
		current = null;
	}

	const result = await readWorkspace(workspaceId);
	if (result.error) {
		throw new Error(result.error.message);
	}

	const workspaceFile = result.data;

	// Extract fields from TablesWithMetadata → TablesSchema
	// (defineWorkspace expects TablesSchema, WorkspaceFile has TablesWithMetadata)
	const tables: TablesSchema = {};
	for (const [key, tableDef] of Object.entries(workspaceFile.tables)) {
		const fields = getTableFields(tableDef);
		if (fields) tables[key] = fields;
	}

	const workspace = defineWorkspace({
		id: workspaceFile.id,
		guid: workspaceFile.guid,
		name: workspaceFile.name,
		tables,
		kv: workspaceFile.kv,
	});

	const client = await workspace.create({ persistence });
	await client.capabilities.persistence.whenSynced;

	current = { id: workspaceId, workspace: workspaceFile, client };
	return current;
}

/**
 * Invalidate cached client (call after mutations that change workspace schema).
 * Next call to ensureWorkspaceClient will reload from disk.
 */
export async function invalidateWorkspaceClient(): Promise<void> {
	if (current) {
		await current.client.destroy();
		current = null;
	}
}

/**
 * Cleanup when leaving workspace routes.
 */
export const destroyCurrentWorkspace = invalidateWorkspaceClient;
