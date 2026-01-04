/**
 * Browser-specific workspace exports.
 *
 * This file is selected by bundlers when the "browser" condition is matched.
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
