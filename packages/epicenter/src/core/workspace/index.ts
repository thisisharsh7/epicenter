/**
 * Workspace exports.
 *
 * Single entry point for workspace types and functions.
 */

export type { Provider, ProviderContext } from '../provider';

export type {
	BoundWorkspaceClient,
	CreateOptions,
	HandlerContext,
	InferProviderExports,
	ProviderMap,
	Workspace,
	WorkspaceManifest,
	WorkspaceSchema,
	WorkspaceWithActions,
	WorkspaceWithProviders,
} from './contract';
export { defineWorkspace } from './contract';
