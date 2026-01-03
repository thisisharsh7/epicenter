/**
 * Browser-specific workspace exports.
 *
 * This file is selected by bundlers when the "browser" condition is matched.
 */

export type { Provider, ProviderContext } from '../provider';

export type { ActionInfo } from './client.shared';

export type {
	BoundAction,
	BoundActions,
	BoundWorkspaceClient,
	CreateOptions,
	HandlerContext,
	HandlerFn,
	HandlersForContracts,
	InferProviderExports,
	ProviderMap,
	Workspace,
	WorkspaceContract,
	WorkspaceWithProviders,
} from './contract';
export { defineWorkspace } from './contract';
