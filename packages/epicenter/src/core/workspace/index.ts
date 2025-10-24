// Definition (config side)
export { defineWorkspace } from './config';
export type {
	WorkspaceConfig,
	AnyWorkspaceConfig,
	WorkspacesToActionMaps,
	Provider,
	ProviderContext,
} from './config';

// Runtime (client side)
export { createWorkspaceClient } from './client';
export type {
	WorkspaceClient,
	WorkspacesToClients,
} from './client';
