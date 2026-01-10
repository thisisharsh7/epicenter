import { defineQuery, defineMutation, queryClient } from './client';
import {
	getRegistry,
	getHeadDoc,
	removeHeadDoc,
	type AppWorkspaceSchema,
} from '$lib/services/workspace-registry';
import { defineWorkspace, generateGuid } from '@epicenter/hq';
import * as Y from 'yjs';
import { workspacePersistence } from '$lib/capabilities/tauri-persistence';
import { Ok, Err } from 'wellcrafted/result';
import { createTaggedError } from 'wellcrafted/error';
import { appLocalDataDir, join } from '@tauri-apps/api/path';
import { revealItemInDir } from '@tauri-apps/plugin-opener';

// ─────────────────────────────────────────────────────────────────────────────
// Error Types
// ─────────────────────────────────────────────────────────────────────────────

export const { WorkspaceError, WorkspaceErr } =
	createTaggedError('WorkspaceError');
export type WorkspaceError = ReturnType<typeof WorkspaceError>;

// ─────────────────────────────────────────────────────────────────────────────
// Query Keys
// ─────────────────────────────────────────────────────────────────────────────

const workspaceKeys = {
	all: ['workspaces'] as const,
	list: () => [...workspaceKeys.all, 'list'] as const,
	detail: (id: string) => [...workspaceKeys.all, 'detail', id] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Queries & Mutations
// ─────────────────────────────────────────────────────────────────────────────

export const workspaces = {
	/**
	 * List all workspaces from the registry.
	 *
	 * Returns workspace GUIDs with minimal metadata. For full schema details,
	 * use getWorkspace() which loads from the workspace Y.Doc.
	 */
	listWorkspaces: defineQuery({
		queryKey: workspaceKeys.list(),
		queryFn: async () => {
			const registry = await getRegistry();
			const guids = registry.getWorkspaceIds();

			// Return minimal workspace info (just GUIDs)
			// Full schema is loaded lazily when navigating to the workspace
			const workspaces = guids.map((id) => ({
				id,
				// Use GUID as placeholder name/slug until we have metadata in registry
				name: id,
				slug: id,
				tables: {} as AppWorkspaceSchema['tables'],
				kv: {} as AppWorkspaceSchema['kv'],
			}));

			return Ok(workspaces);
		},
	}),

	/**
	 * Get a single workspace by GUID.
	 *
	 * Loads the full schema from the workspace Y.Doc.
	 */
	getWorkspace: (workspaceId: string) =>
		defineQuery({
			queryKey: workspaceKeys.detail(workspaceId),
			queryFn: async () => {
				const registry = await getRegistry();

				// Check if workspace exists in registry
				if (!registry.hasWorkspace(workspaceId)) {
					return WorkspaceErr({
						message: `Workspace "${workspaceId}" not found`,
					});
				}

				// Load schema from Y.Doc
				const head = await getHeadDoc(workspaceId);
				const epoch = head.getEpoch();
				const schema = await loadWorkspaceSchema(workspaceId, epoch);

				return Ok(schema);
			},
		}),

	/**
	 * Create a new workspace.
	 *
	 * 1. Generates a GUID for the workspace
	 * 2. Adds the GUID to the registry
	 * 3. Creates a head doc (epoch starts at 0)
	 * 4. Creates the workspace doc with initial schema
	 */
	createWorkspace: defineMutation({
		mutationKey: ['workspaces', 'create'],
		mutationFn: async (input: { name: string; slug: string }) => {
			// Generate GUID for sync coordination
			const guid = generateGuid();

			// Create schema
			const schema: AppWorkspaceSchema = {
				id: guid,
				slug: input.slug,
				name: input.name,
				tables: {},
				kv: {},
			};

			// Add to registry (persisted automatically via registryPersistence)
			const registry = await getRegistry();
			registry.addWorkspace(guid);

			// Initialize head doc at epoch 0
			await getHeadDoc(guid);

			// Create workspace client to initialize the workspace doc
			// This writes the schema to the Y.Doc
			const workspace = defineWorkspace(schema);
			const client = await workspace.create({
				epoch: 0,
				capabilities: {
					persistence: (ctx: { ydoc: Y.Doc }) =>
						workspacePersistence(ctx.ydoc, guid, 0),
				},
			});

			// Wait for persistence then destroy (we just needed to create the file)
			await client.capabilities.persistence.whenSynced;
			await client.destroy();

			console.log(`[createWorkspace] Created workspace:`, {
				guid,
				slug: schema.slug,
				name: schema.name,
			});

			// Invalidate list query
			queryClient.invalidateQueries({ queryKey: workspaceKeys.list() });

			return Ok(schema);
		},
	}),

	/**
	 * Delete a workspace.
	 *
	 * Removes from registry and head doc cache. Does NOT delete files on disk.
	 * (File cleanup can be added later if needed)
	 */
	deleteWorkspace: defineMutation({
		mutationKey: ['workspaces', 'delete'],
		mutationFn: async (guid: string) => {
			const registry = await getRegistry();

			// Check if workspace exists
			if (!registry.hasWorkspace(guid)) {
				return WorkspaceErr({
					message: `Workspace "${guid}" not found`,
				});
			}

			// Remove from registry
			registry.removeWorkspace(guid);

			// Remove head doc from cache
			removeHeadDoc(guid);

			// Invalidate queries
			queryClient.invalidateQueries({ queryKey: workspaceKeys.list() });
			queryClient.removeQueries({ queryKey: workspaceKeys.detail(guid) });

			return Ok(undefined);
		},
	}),

	/**
	 * Open the workspaces directory in the file explorer.
	 */
	openWorkspacesDirectory: defineMutation({
		mutationKey: ['workspaces', 'openDirectory'],
		mutationFn: async () => {
			try {
				const baseDir = await appLocalDataDir();
				const workspacesPath = await join(baseDir, 'workspaces');
				await revealItemInDir(workspacesPath);
				return Ok(undefined);
			} catch (error) {
				return WorkspaceErr({
					message: `Failed to open workspaces directory: ${error}`,
				});
			}
		},
	}),

	// ───────────────────────────────────────────────────────────────────────────
	// Schema Modification (Temporary stubs - will be refactored)
	// In the new architecture, these should modify the live workspace client,
	// not the query layer. For now, they're stubs to keep the UI working.
	// ───────────────────────────────────────────────────────────────────────────

	/**
	 * Add a table to a workspace schema.
	 *
	 * TODO: This should modify the live workspace client's Y.Doc schema,
	 * not go through the query layer.
	 */
	addTable: defineMutation({
		mutationKey: ['workspaces', 'addTable'],
		mutationFn: async (_input: {
			workspaceId: string;
			name: string;
			id: string;
			icon?: string | null;
			description?: string;
		}) => {
			// TODO: Implement via workspace client
			return WorkspaceErr({
				message: 'Adding tables is not yet implemented in the new architecture',
			});
		},
	}),

	/**
	 * Remove a table from a workspace schema.
	 */
	removeTable: defineMutation({
		mutationKey: ['workspaces', 'removeTable'],
		mutationFn: async (_input: { workspaceId: string; tableName: string }) => {
			// TODO: Implement via workspace client
			return WorkspaceErr({
				message:
					'Removing tables is not yet implemented in the new architecture',
			});
		},
	}),

	/**
	 * Add a KV entry to a workspace schema.
	 */
	addKvEntry: defineMutation({
		mutationKey: ['workspaces', 'addKvEntry'],
		mutationFn: async (_input: {
			workspaceId: string;
			name: string;
			key: string;
		}) => {
			// TODO: Implement via workspace client
			return WorkspaceErr({
				message:
					'Adding KV entries is not yet implemented in the new architecture',
			});
		},
	}),

	/**
	 * Remove a KV entry from a workspace schema.
	 */
	removeKvEntry: defineMutation({
		mutationKey: ['workspaces', 'removeKvEntry'],
		mutationFn: async (_input: { workspaceId: string; key: string }) => {
			// TODO: Implement via workspace client
			return WorkspaceErr({
				message:
					'Removing KV entries is not yet implemented in the new architecture',
			});
		},
	}),
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load a workspace schema from its Y.Doc.
 *
 * Creates a temporary Y.Doc to read the schema, then destroys it.
 */
async function loadWorkspaceSchema(
	workspaceId: string,
	epoch: number,
): Promise<AppWorkspaceSchema> {
	const docId = `${workspaceId}-${epoch}`;
	const ydoc = new Y.Doc({ guid: docId, gc: false });

	// Load from persistence
	const persistence = await workspacePersistence(ydoc, workspaceId, epoch);
	await persistence.whenSynced;

	// Extract schema from Y.Doc
	const metaMap = ydoc.getMap<string>('meta');
	const schemaMap = ydoc.getMap('schema');

	const name = metaMap.get('name') ?? 'Untitled';
	const slug = metaMap.get('slug') ?? workspaceId;

	// Extract tables from schema map
	const tablesYMap = schemaMap.get('tables') as
		| Y.Map<Y.Map<unknown>>
		| undefined;
	const tables: AppWorkspaceSchema['tables'] = {};

	if (tablesYMap) {
		for (const [tableName, tableMap] of tablesYMap.entries()) {
			const fieldsMap = tableMap.get('fields') as Y.Map<unknown> | undefined;
			const fields: Record<string, unknown> = {};

			if (fieldsMap) {
				for (const [fieldName, fieldDef] of fieldsMap.entries()) {
					fields[fieldName] = fieldDef;
				}
			}

			tables[tableName] = {
				name: (tableMap.get('name') as string) ?? tableName,
				icon:
					(tableMap.get(
						'icon',
					) as AppWorkspaceSchema['tables'][string]['icon']) ?? null,
				cover:
					(tableMap.get(
						'cover',
					) as AppWorkspaceSchema['tables'][string]['cover']) ?? null,
				description: (tableMap.get('description') as string) ?? '',
				fields: fields as AppWorkspaceSchema['tables'][string]['fields'],
			};
		}
	}

	// Extract KV from schema map
	const kvYMap = schemaMap.get('kv') as Y.Map<unknown> | undefined;
	const kv: AppWorkspaceSchema['kv'] = {};

	if (kvYMap) {
		for (const [key, value] of kvYMap.entries()) {
			kv[key] = value as AppWorkspaceSchema['kv'][string];
		}
	}

	// Clean up temporary Y.Doc
	persistence.destroy();
	ydoc.destroy();

	return {
		id: workspaceId,
		slug,
		name,
		tables,
		kv,
	};
}
