// Definition (config side)
export { defineWorkspace } from './config';
export type {
	WorkspaceConfig,
	ImmediateDependencyWorkspaceConfig,
	DependencyWorkspaceConfig,
	DependencyActionsMap,
	AnyWorkspaceConfig,
} from './config';

// Runtime (client side)
export { createWorkspaceClient } from './client';
export type { WorkspaceClient } from './client';
