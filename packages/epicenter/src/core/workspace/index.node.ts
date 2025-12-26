/**
 * Node.js-specific workspace exports.
 *
 * This file is selected by bundlers when the "node" condition is matched.
 */

// Provider types (shared)
export type { Provider, ProviderContext } from '../provider';
// Runtime - node version
export { createClient, type CreateClientOptions } from './client.node';
// Types from shared (no platform-specific code)
export type {
	ActionInfo,
	EpicenterClient,
	WorkspaceClient,
	WorkspacesToClients,
} from './client.shared';
export { iterActions } from './client.shared';

// Config types and definition (shared)
export type {
	AnyWorkspaceConfig,
	WorkspaceConfig,
	WorkspacesToExports,
} from './config';
export { defineWorkspace } from './config';
