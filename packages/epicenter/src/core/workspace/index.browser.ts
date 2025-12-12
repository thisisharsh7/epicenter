/**
 * Browser-specific workspace exports.
 *
 * This file is selected by bundlers when the "browser" condition is matched.
 */

// Provider types (shared)
export type { Provider, ProviderContext } from '../provider';
// Runtime and types - browser version
export { createWorkspaceClient } from './client.browser';
export type { WorkspaceClient, WorkspacesToClients } from './client.browser';

// Config types and definition (shared)
export type {
	AnyWorkspaceConfig,
	WorkspaceConfig,
	WorkspacesToExports,
} from './config';
export { defineWorkspace } from './config';
