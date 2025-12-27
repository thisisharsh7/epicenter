/**
 * Browser-specific workspace exports.
 *
 * This file is selected by bundlers when the "browser" condition is matched.
 */

// Provider types (shared)
export type { Provider, ProviderContext } from '../provider';
// Browser-specific types (with whenSynced)
export type {
	EpicenterClient,
	WorkspaceClient,
	WorkspacesToClients,
} from './client.browser';
// Runtime - browser version
export { createClient } from './client.browser';

// Shared utilities
export type { ActionInfo } from './client.shared';
export { iterActions } from './client.shared';

// Config types and definition (shared)
export type {
	AnyWorkspaceConfig,
	WorkspaceConfig,
	WorkspacesToActions,
} from './config';
export { defineWorkspace } from './config';
