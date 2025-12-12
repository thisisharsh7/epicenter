/**
 * Node.js-specific workspace exports.
 *
 * This file is selected by bundlers when the "node" condition is matched.
 */

// Provider types (node-specific)
export type { Provider, ProviderContext } from '../provider.node';
// Runtime and types - node version
export { createWorkspaceClient } from './client.node';
export type { WorkspaceClient, WorkspacesToClients } from './client.node';

// Config types and definition (node-specific)
export type {
	AnyWorkspaceConfig,
	WorkspaceConfig,
	WorkspacesToExports,
} from './config.node';
export { defineWorkspace } from './config.node';
