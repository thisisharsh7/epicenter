// Definition (config side)
export { defineWorkspace } from './config';
export type {
	WorkspaceConfig,
	AnyWorkspaceConfig,
	WorkspacesToExports,
} from './config';

// Provider types
export type { Provider, ProviderContext } from '../provider';

// Runtime (client side)
export { createWorkspaceClient } from './client';
export type {
	WorkspaceClient,
	WorkspacesToClients,
} from './client';
