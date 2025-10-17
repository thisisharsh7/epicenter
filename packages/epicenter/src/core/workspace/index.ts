// Definition (config side)
export { defineWorkspace } from './config';
export type {
	WorkspaceConfig,
	AnyWorkspaceConfig,
	ImmediateDependencyWorkspaceConfig,
	DependencyWorkspaceConfig,
	DependencyActionsMap,
} from './config';

// Runtime (client side)
export { createWorkspaceClient } from './client';
export type { WorkspaceClient } from './client';
