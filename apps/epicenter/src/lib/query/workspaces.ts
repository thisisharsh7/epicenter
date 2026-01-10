import { defineQuery, defineMutation, queryClient } from './client';
import {
	getRegistry,
	getHeadDoc,
	getAllWorkspaceSchemas,
	getWorkspaceSchema,
	findWorkspaceBySlug,
	setWorkspaceSchema,
	removeWorkspaceSchema,
	removeHeadDoc,
	isSlugTaken,
	type AppWorkspaceSchema,
} from '$lib/services/workspace-registry';
import { defineWorkspace, generateGuid } from '@epicenter/hq';
import type * as Y from 'yjs';
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
	 * Returns cached schemas. Requires bootstrap() to have been called.
	 */
	listWorkspaces: defineQuery({
		queryKey: workspaceKeys.list(),
		queryFn: async () => {
			// Get all schemas from the in-memory cache
			const schemas = getAllWorkspaceSchemas();
			return Ok(schemas);
		},
	}),

	/**
	 * Get a single workspace by slug or GUID.
	 */
	getWorkspace: (slugOrGuid: string) =>
		defineQuery({
			queryKey: workspaceKeys.detail(slugOrGuid),
			queryFn: async () => {
				// Try direct GUID lookup first
				let schema = getWorkspaceSchema(slugOrGuid);

				// Fall back to slug lookup
				if (!schema) {
					schema = findWorkspaceBySlug(slugOrGuid);
				}

				if (!schema) {
					return WorkspaceErr({
						message: `Workspace "${slugOrGuid}" not found`,
					});
				}

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
			// Check if slug already exists
			if (isSlugTaken(input.slug)) {
				return WorkspaceErr({
					message: `Workspace with slug "${input.slug}" already exists`,
				});
			}

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

			// Cache the schema
			setWorkspaceSchema(guid, schema);
			console.log(`[createWorkspace] Cached schema:`, {
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
	 * Removes from registry and cache. Does NOT delete files on disk.
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

			// Remove from caches
			removeWorkspaceSchema(guid);
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
