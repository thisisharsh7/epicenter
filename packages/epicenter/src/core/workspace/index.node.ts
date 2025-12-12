/**
 * Node.js-specific workspace exports.
 *
 * This file is selected by bundlers when the "node" condition is matched.
 */

// Provider types (shared)
export type { Provider, ProviderContext } from '../provider';
// Runtime and types - node version
export { createWorkspaceClient } from './client.node';
export type { WorkspaceClient, WorkspacesToClients } from './client.node';

// Config types and definition (shared)
export type {
	AnyWorkspaceConfig,
	WorkspaceConfig,
	WorkspacesToExports,
} from './config';
export { defineWorkspace } from './config';
