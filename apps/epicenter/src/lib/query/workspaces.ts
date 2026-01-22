import type { WorkspaceSchema } from '@epicenter/hq';
import { appLocalDataDir, join } from '@tauri-apps/api/path';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { createTaggedError } from 'wellcrafted/error';
import { Ok } from 'wellcrafted/result';
import { registry } from '$lib/docs/registry';
import { createWorkspaceClient } from '$lib/docs/workspace';
import type { WorkspaceTemplate } from '$lib/templates';
import { defineMutation, defineQuery, queryClient } from './client';

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
	 * List all workspaces from the registry with their names.
	 *
	 * Uses Head Doc meta for identity (name, icon) and Workspace Doc for schema.
	 * Falls back to ID if workspace can't be loaded.
	 */
	listWorkspaces: defineQuery({
		queryKey: workspaceKeys.list(),
		queryFn: async () => {
			const guids = registry.getWorkspaceIds();

			// Load workspaces in parallel
			const workspaces = await Promise.all(
				guids.map(async (id) => {
					try {
						// Get identity from Head Doc
						const head = registry.head(id);
						await head.whenSynced;
						const meta = head.getMeta();

						// Get schema from Workspace Doc
						const client = head.client();
						await client.whenSynced;
						const schema = client.getSchema();
						await client.destroy();
						await head.destroy();

						return {
							id,
							name: meta.name || id,
							tables: schema.tables,
							kv: schema.kv,
						};
					} catch {
						// Workspace exists in registry but can't be loaded
						return {
							id,
							name: id,
							tables: {},
							kv: {},
						};
					}
				}),
			);

			return Ok(workspaces);
		},
	}),

	/**
	 * Get a single workspace by ID.
	 *
	 * Uses Head Doc meta for identity and Workspace Doc for schema.
	 */
	getWorkspace: (workspaceId: string) =>
		defineQuery({
			queryKey: workspaceKeys.detail(workspaceId),
			queryFn: async () => {
				// Check if workspace exists in registry
				if (!registry.hasWorkspace(workspaceId)) {
					return WorkspaceErr({
						message: `Workspace "${workspaceId}" not found`,
					});
				}

				// Get identity from Head Doc
				const head = registry.head(workspaceId);
				await head.whenSynced;
				const meta = head.getMeta();

				// Get schema from Workspace Doc
				const client = head.client();
				await client.whenSynced;
				const schema = client.getSchema();
				await client.destroy();
				await head.destroy();

				return Ok({
					id: workspaceId,
					name: meta.name || workspaceId,
					...schema,
				} as unknown as WorkspaceDefinition);
			},
		}),

	/**
	 * Create a new workspace.
	 *
	 * Flow:
	 * 1. Add workspace ID to registry
	 * 2. Initialize head doc and set meta (name, icon, description)
	 * 3. Create workspace client with definition (static schema mode)
	 * 4. Persistence writes schema.json to epoch folder
	 *
	 * Uses `createWorkspaceClient` (static schema mode) because we're seeding
	 * a new workspace with a known schema.
	 *
	 * If a template is provided, the tables and kv from the template are used
	 * instead of starting with empty collections.
	 */
	createWorkspace: defineMutation({
		mutationKey: ['workspaces', 'create'],
		mutationFn: async (input: {
			name: string;
			id: string;
			template: WorkspaceTemplate | null;
		}) => {
			// Create schema using template if provided
			const schema: WorkspaceSchema = {
				tables: input.template?.tables ?? {},
				kv: input.template?.kv ?? {},
			};

			// Add to registry (persisted automatically via registryPersistence)
			registry.addWorkspace(input.id);

			// Initialize head doc and set workspace identity in meta map
			const head = registry.head(input.id);
			await head.whenSynced;
			head.setMeta({ name: input.name, icon: null, description: '' });

			// Create workspace client with schema - this will:
			// 1. Merge schema into Y.Map('schema')
			// 2. Persist to {epoch}/schema.json via unified persistence
			const client = createWorkspaceClient(head, schema);

			// Wait for persistence to finish saving initial state to disk
			await client.whenSynced;
			await client.destroy();
			await head.destroy();

			console.log(`[createWorkspace] Created workspace:`, {
				id: input.id,
				name: input.name,
			});

			// Invalidate list query
			queryClient.invalidateQueries({ queryKey: workspaceKeys.list() });

			return Ok({ id: input.id, name: input.name, ...schema });
		},
	}),

	/**
	 * Update a workspace's name.
	 *
	 * Uses Head Doc's meta map to update workspace identity.
	 * Persistence automatically writes to head.yjs.
	 *
	 * Note: The workspace ID cannot be changed after creation.
	 */
	updateWorkspace: defineMutation({
		mutationKey: ['workspaces', 'update'],
		mutationFn: async (input: { workspaceId: string; name: string }) => {
			// Check if workspace exists
			if (!registry.hasWorkspace(input.workspaceId)) {
				return WorkspaceErr({
					message: `Workspace "${input.workspaceId}" not found`,
				});
			}

			// Use Head Doc to update the workspace name
			// Workspace identity (name, icon, description) lives in the Head Doc's meta map
			const head = registry.head(input.workspaceId);
			await head.whenSynced;
			head.setMeta({ name: input.name });

			// Get the workspace schema (tables, kv) from workspace client
			const client = head.client();
			await client.whenSynced;
			const schema = client.getSchema();
			await client.destroy();

			// Clean up head doc (it's been modified, changes auto-persist)
			await head.destroy();

			console.log(`[updateWorkspace] Updated workspace:`, {
				id: input.workspaceId,
				name: input.name,
			});

			// Invalidate queries to refresh UI
			queryClient.invalidateQueries({ queryKey: workspaceKeys.list() });
			queryClient.invalidateQueries({
				queryKey: workspaceKeys.detail(input.workspaceId),
			});

			return Ok({
				id: input.workspaceId,
				name: input.name,
				...schema,
			} as unknown as WorkspaceDefinition);
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
			// Check if workspace exists
			if (!registry.hasWorkspace(guid)) {
				return WorkspaceErr({
					message: `Workspace "${guid}" not found`,
				});
			}

			// Remove from registry
			registry.removeWorkspace(guid);

			// Note: Head doc cleanup happens automatically when navigating away
			// since head docs are now created per-navigation, not cached

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
	// Definition Modification (Temporary stubs - will be refactored)
	// In the new architecture, these should modify the live workspace client,
	// not the query layer. For now, they're stubs to keep the UI working.
	// ───────────────────────────────────────────────────────────────────────────

	/**
	 * Add a table to a workspace definition.
	 *
	 * TODO: This should modify the live workspace client's Y.Doc,
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
	 * Remove a table from a workspace definition.
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
	 * Add a KV entry to a workspace definition.
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
	 * Remove a KV entry from a workspace definition.
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
