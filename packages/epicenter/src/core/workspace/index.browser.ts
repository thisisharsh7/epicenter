/**
 * Browser-specific workspace exports.
 *
 * This file is selected by bundlers when the "browser" condition is matched.
 */

// Provider types (shared)
export type { Provider, ProviderContext } from '../provider';
// Runtime - browser version
export { createWorkspaceClient } from './client.browser';
// Types from shared (no platform-specific code)
export type { WorkspaceClient, WorkspacesToClients } from './client.shared';

// Config types and definition (shared)
export type {
	AnyWorkspaceConfig,
	WorkspaceConfig,
	WorkspacesToExports,
} from './config';
export { defineWorkspace } from './config';
