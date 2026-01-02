/**
 * Node.js-specific workspace exports.
 *
 * This file is selected by bundlers when the "node" condition is matched.
 */

// Provider types (shared)
export type { Provider, ProviderContext } from '../provider';
// Node-specific types (no whenSynced - async initialization)
export type {
	EpicenterClient,
	WorkspaceClient,
	WorkspacesToClients,
} from './client.node';
// Runtime - node version
export { type CreateClientOptions, createClient } from './client.node';

// Shared utilities
export type { ActionInfo } from './client.shared';

// Config types and definition (shared)
export type {
	AnyWorkspaceConfig,
	WorkspaceConfig,
	WorkspacesToActions,
} from './config';
export { defineWorkspace } from './config';

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
	WorkspaceContract,
	WorkspaceContractConfig,
	WorkspaceWithHandlers,
	WorkspaceWithProviders,
} from './contract';
export { defineWorkspace as defineWorkspaceContract } from './contract';
