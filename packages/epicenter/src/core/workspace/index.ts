// Definition (config side)
export { defineWorkspace } from './config';
export type {
	WorkspaceConfig,
	AnyWorkspaceConfig,
	ShallowWorkspaceConfig,
	DependencyWorkspacesAPI,
	IndexesAPI,
} from './config';

// Runtime (client side)
export { createWorkspaceClient } from './client';
export type { WorkspaceClient, RuntimeConfig } from './client';
