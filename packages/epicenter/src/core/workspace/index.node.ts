/**
 * Node.js-specific workspace exports.
 *
 * This file is selected by bundlers when the "node" condition is matched.
 */

// Provider types (shared)
export type { Provider, ProviderContext } from '../provider';

// Runtime - node version
export { createClient, type CreateClientOptions } from './client.node';

// Node-specific types (no whenSynced - async initialization)
export type {
	EpicenterClient,
	WorkspaceClient,
	WorkspacesToClients,
} from './client.node';

// Shared utilities
export type { ActionInfo } from './client.shared';
export { iterActions } from './client.shared';

// Config types and definition (shared)
export type {
	AnyWorkspaceConfig,
	WorkspaceConfig,
	WorkspacesToExports,
} from './config';
export { defineWorkspace } from './config';
