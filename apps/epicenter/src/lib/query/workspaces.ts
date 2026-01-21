import type { WorkspaceDefinition } from '@epicenter/hq';
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
	 * Uses fluent API to load definition from Y.Doc.
	 * Falls back to ID if definition can't be loaded.
	 */
	listWorkspaces: defineQuery({
		queryKey: workspaceKeys.list(),
		queryFn: async () => {
			const guids = registry.getWorkspaceIds();

			// Load definitions in parallel via fluent API
			const workspaces = await Promise.all(
				guids.map(async (id) => {
					try {
						const client = registry.head(id).client();
						await client.whenSynced;
						const definition = client.getDefinition();
						await client.destroy();

						return {
							id,
							name: definition.name || id,
							tables: definition.tables,
							kv: definition.kv,
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
	 * Uses fluent API to read definition from Y.Doc.
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

				// Use fluent API to get definition from Y.Doc
				const client = registry.head(workspaceId).client();
				await client.whenSynced;
				const definition = client.getDefinition();
				await client.destroy();

				// Add id to match WorkspaceDefinition type
				// Note: WorkspaceDefinitionMap from Y.Doc has looser types than WorkspaceDefinition
				return Ok({
					id: workspaceId,
					...definition,
				} as unknown as WorkspaceDefinition);
			},
		}),

	/**
	 * Create a new workspace.
	 *
	 * Flow:
	 * 1. Add workspace ID to registry
	 * 2. Initialize head doc via fluent API (epoch starts at 0)
	 * 3. Create workspace client with definition (static schema mode)
	 * 4. Persistence writes definition.json to epoch folder
	 *
	 * Uses `createWorkspaceClient` (static schema mode) because we're seeding
	 * a new workspace with a known definition.
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
			// Create definition using the user-provided ID directly
			// If a template is provided, use its tables and kv
			const definition: WorkspaceDefinition = {
				id: input.id,
				name: input.name,
				tables: input.template?.tables ?? {},
				kv: input.template?.kv ?? {},
			};

			// Add to registry (persisted automatically via registryPersistence)
			registry.addWorkspace(input.id);

			// Initialize head doc via fluent API (epoch starts at 0)
			const head = registry.head(input.id);
			await head.whenSynced;

			// Create workspace client with static definition - this will:
			// 1. Merge definition into Y.Map('definition')
			// 2. Persist to {epoch}/definition.json via unified persistence
			const client = createWorkspaceClient(definition, 0);

			// Wait for persistence to finish saving initial state to disk
			await client.whenSynced;
			await client.destroy();

			console.log(`[createWorkspace] Created workspace:`, {
				id: input.id,
				name: definition.name,
			});

			// Invalidate list query
			queryClient.invalidateQueries({ queryKey: workspaceKeys.list() });

			return Ok(definition);
		},
	}),

	/**
	 * Update a workspace's name.
	 *
	 * Uses fluent API to update the name in Y.Map('definition').
	 * Persistence automatically writes to definition.json.
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

			// Use fluent API to update the name directly in Y.Doc
			const client = registry.head(input.workspaceId).client();
			await client.whenSynced;

			// Update the name in Y.Map('definition')
			// The client.name setter writes to the Y.Doc
			const { definition: definitionMap } = await import('@epicenter/hq').then(
				(m) => m.getWorkspaceDocMaps(client.ydoc),
			);
			definitionMap.set('name', input.name);

			// Get the updated definition
			const definition = client.getDefinition();
			await client.destroy();

			console.log(`[updateWorkspace] Updated workspace:`, {
				id: input.workspaceId,
				name: input.name,
			});

			// Invalidate queries to refresh UI
			queryClient.invalidateQueries({ queryKey: workspaceKeys.list() });
			queryClient.invalidateQueries({
				queryKey: workspaceKeys.detail(input.workspaceId),
			});

			// Note: WorkspaceDefinitionMap from Y.Doc has looser types than WorkspaceDefinition
			return Ok({
				id: input.workspaceId,
				...definition,
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
