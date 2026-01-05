import { defineQuery, defineMutation, queryClient } from './client';
import {
	workspaceStorage,
	type WorkspaceFile,
} from '$lib/services/workspace-storage';
import { Ok, Err } from 'wellcrafted/result';

const workspaceKeys = {
	all: ['workspaces'] as const,
	list: () => [...workspaceKeys.all, 'list'] as const,
	detail: (id: string) => [...workspaceKeys.all, 'detail', id] as const,
};

export const workspaces = {
	listWorkspaces: defineQuery({
		queryKey: workspaceKeys.list(),
		queryFn: async () => {
			const result = await workspaceStorage.listWorkspaces();
			if (result.error) {
				return Err(result.error);
			}
			return Ok(result.data);
		},
	}),

	getWorkspace: (id: string) =>
		defineQuery({
			queryKey: workspaceKeys.detail(id),
			queryFn: async () => {
				const result = await workspaceStorage.readWorkspace(id);
				if (result.error) {
					return Err(result.error);
				}
				return Ok(result.data);
			},
		}),

	createWorkspace: defineMutation({
		mutationKey: ['workspaces', 'create'],
		mutationFn: async (input: { name: string; id: string }) => {
			const existsResult = await workspaceStorage.workspaceExists(input.id);
			if (existsResult.error) {
				return Err(existsResult.error);
			}
			if (existsResult.data) {
				return Err({
					_tag: 'WorkspaceStorageError' as const,
					message: `Workspace with ID "${input.id}" already exists`,
				});
			}

			const now = new Date().toISOString();

			const workspace: WorkspaceFile = {
				id: input.id,
				name: input.name,
				tables: {},
				createdAt: now,
				updatedAt: now,
			};

			const result = await workspaceStorage.writeWorkspace(workspace);
			if (result.error) {
				return Err(result.error);
			}

			queryClient.invalidateQueries({ queryKey: workspaceKeys.list() });
			return Ok(workspace);
		},
	}),

	updateWorkspace: defineMutation({
		mutationKey: ['workspaces', 'update'],
		mutationFn: async (workspace: WorkspaceFile) => {
			const updated: WorkspaceFile = {
				...workspace,
				updatedAt: new Date().toISOString(),
			};

			const result = await workspaceStorage.writeWorkspace(updated);
			if (result.error) {
				return Err(result.error);
			}

			queryClient.invalidateQueries({
				queryKey: workspaceKeys.detail(workspace.id),
			});
			queryClient.invalidateQueries({ queryKey: workspaceKeys.list() });
			return Ok(updated);
		},
	}),

	openWorkspacesDirectory: defineMutation({
		mutationKey: ['workspaces', 'openDirectory'],
		mutationFn: async () => {
			const result = await workspaceStorage.openWorkspacesDirectory();
			if (result.error) {
				return Err(result.error);
			}
			return Ok(undefined);
		},
	}),
};
