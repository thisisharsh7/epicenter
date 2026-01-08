import { defineQuery, defineMutation, queryClient } from './client';
import {
	workspaceStorage,
	WorkspaceStorageErr,
	type WorkspaceFile,
} from '$lib/services/workspace-storage';
import { Ok, Err } from 'wellcrafted/result';
import { generateGuid, id, text } from '@epicenter/hq';

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
				return WorkspaceStorageErr({
					message: `Workspace with ID "${input.id}" already exists`,
				});
			}

			const workspace: WorkspaceFile = {
				guid: generateGuid(),
				id: input.id,
				name: input.name,
				emoji: '📁',
				description: '',
				tables: {},
				kv: {},
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
			const result = await workspaceStorage.writeWorkspace(workspace);
			if (result.error) {
				return Err(result.error);
			}

			queryClient.invalidateQueries({
				queryKey: workspaceKeys.detail(workspace.id),
			});
			queryClient.invalidateQueries({ queryKey: workspaceKeys.list() });
			return Ok(workspace);
		},
	}),

	deleteWorkspace: defineMutation({
		mutationKey: ['workspaces', 'delete'],
		mutationFn: async (id: string) => {
			const result = await workspaceStorage.deleteWorkspace(id);
			if (result.error) {
				return Err(result.error);
			}

			queryClient.invalidateQueries({ queryKey: workspaceKeys.list() });
			queryClient.removeQueries({ queryKey: workspaceKeys.detail(id) });
			return Ok(undefined);
		},
	}),

	addTable: defineMutation({
		mutationKey: ['workspaces', 'addTable'],
		mutationFn: async (input: { workspaceId: string; tableName: string }) => {
			const readResult = await workspaceStorage.readWorkspace(
				input.workspaceId,
			);
			if (readResult.error) {
				return Err(readResult.error);
			}

			const workspace = readResult.data;
			if (workspace.tables[input.tableName]) {
				return WorkspaceStorageErr({
					message: `Table "${input.tableName}" already exists`,
				});
			}

			workspace.tables[input.tableName] = { id: id() };

			const writeResult = await workspaceStorage.writeWorkspace(workspace);
			if (writeResult.error) {
				return Err(writeResult.error);
			}

			queryClient.invalidateQueries({
				queryKey: workspaceKeys.detail(input.workspaceId),
			});
			return Ok(workspace);
		},
	}),

	removeTable: defineMutation({
		mutationKey: ['workspaces', 'removeTable'],
		mutationFn: async (input: { workspaceId: string; tableName: string }) => {
			const readResult = await workspaceStorage.readWorkspace(
				input.workspaceId,
			);
			if (readResult.error) {
				return Err(readResult.error);
			}

			const workspace = readResult.data;
			if (!workspace.tables[input.tableName]) {
				return WorkspaceStorageErr({
					message: `Table "${input.tableName}" does not exist`,
				});
			}

			delete workspace.tables[input.tableName];

			const writeResult = await workspaceStorage.writeWorkspace(workspace);
			if (writeResult.error) {
				return Err(writeResult.error);
			}

			queryClient.invalidateQueries({
				queryKey: workspaceKeys.detail(input.workspaceId),
			});
			return Ok(workspace);
		},
	}),

	addKvEntry: defineMutation({
		mutationKey: ['workspaces', 'addKvEntry'],
		mutationFn: async (input: { workspaceId: string; key: string }) => {
			const readResult = await workspaceStorage.readWorkspace(
				input.workspaceId,
			);
			if (readResult.error) {
				return Err(readResult.error);
			}

			const workspace = readResult.data;
			if (workspace.kv[input.key]) {
				return WorkspaceStorageErr({
					message: `Setting "${input.key}" already exists`,
				});
			}

			workspace.kv[input.key] = text();

			const writeResult = await workspaceStorage.writeWorkspace(workspace);
			if (writeResult.error) {
				return Err(writeResult.error);
			}

			queryClient.invalidateQueries({
				queryKey: workspaceKeys.detail(input.workspaceId),
			});
			return Ok(workspace);
		},
	}),

	removeKvEntry: defineMutation({
		mutationKey: ['workspaces', 'removeKvEntry'],
		mutationFn: async (input: { workspaceId: string; key: string }) => {
			const readResult = await workspaceStorage.readWorkspace(
				input.workspaceId,
			);
			if (readResult.error) {
				return Err(readResult.error);
			}

			const workspace = readResult.data;
			if (!workspace.kv[input.key]) {
				return WorkspaceStorageErr({
					message: `Setting "${input.key}" does not exist`,
				});
			}

			delete workspace.kv[input.key];

			const writeResult = await workspaceStorage.writeWorkspace(workspace);
			if (writeResult.error) {
				return Err(writeResult.error);
			}

			queryClient.invalidateQueries({
				queryKey: workspaceKeys.detail(input.workspaceId),
			});
			return Ok(workspace);
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
