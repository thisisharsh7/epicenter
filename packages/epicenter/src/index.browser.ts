/**
 * Browser entry point for Epicenter.
 *
 * This file is selected by bundlers when the "browser" condition is matched.
 * It excludes Node.js-specific exports like createServer.
 */

// All platform-agnostic exports
export * from './index.shared';

// Browser-specific: Provider types (no storageDir/epicenterDir in context)
export type { Provider, ProviderContext } from './core/provider.browser';

// Browser-specific: EpicenterConfig type (no storageDir)
export type { EpicenterConfig } from './core/epicenter/config.browser';
export { defineEpicenter } from './core/epicenter/config.browser';

// Browser-specific: runtime functions
export { createEpicenterClient } from './core/epicenter/client.browser';
export { createWorkspaceClient } from './core/workspace/client.browser';

// Browser-specific: types (browser WorkspaceClient has whenSynced)
export type {
	WorkspaceClient,
	WorkspacesToClients,
} from './core/workspace/client.browser';
export type { ActionInfo, EpicenterClient } from './core/epicenter/client.browser';
export { iterActions } from './core/epicenter/client.browser';

// Browser-specific: workspace config (uses browser Provider type)
export type { WorkspaceConfig } from './core/workspace/config.browser';
export { defineWorkspace } from './core/workspace/config.browser';

// Note: createServer is NOT exported in browser builds (Node.js only)
