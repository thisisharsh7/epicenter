// Definition (config side)
export { defineWorkspace } from './config';
export type {
	WorkspaceConfig,
	AnyWorkspaceConfig,
	DependencyWorkspacesAPI,
	IndexesAPI,
	ExtractHandlers,
} from './config';

// Runtime (client side)
export { createWorkspaceClient, extractHandlers } from './client';
export type { WorkspaceClient, RuntimeConfig } from './client';
