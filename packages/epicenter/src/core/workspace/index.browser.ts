/**
 * Browser-specific workspace exports.
 *
 * This file is selected by bundlers when the "browser" condition is matched.
 */

// Provider types (browser-specific)
export type { Provider, ProviderContext } from '../provider.browser';
// Runtime and types - browser version
export { createWorkspaceClient } from './client.browser';
export type { WorkspaceClient, WorkspacesToClients } from './client.browser';

// Config types and definition (browser-specific)
export type {
	AnyWorkspaceConfig,
	WorkspaceConfig,
	WorkspacesToExports,
} from './config.browser';
export { defineWorkspace } from './config.browser';
