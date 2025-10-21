// Definition (config side)
export { defineWorkspace } from './config';
export type {
	WorkspaceConfig,
	AnyWorkspaceConfig,
} from './config';

// Runtime (client side)
export { createWorkspaceClient } from './client';
export type {
	WorkspaceClient,
	WorkspacesToClients,
	WorkspacesToActionMaps,
} from './types';
