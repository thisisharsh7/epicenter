/**
 * Browser entry point for Epicenter.
 *
 * This file is selected by bundlers when the "browser" condition is matched.
 * It excludes Node.js-specific exports like createServer.
 */

// All platform-agnostic exports
export * from './index.shared';

// Browser-specific: client creation (sync with whenSynced)
export {
	createClient,
	createWorkspaceClient,
} from './core/workspace/client.browser';

// Browser client types (include whenSynced)
export type {
	EpicenterClient,
	WorkspaceClient,
	WorkspacesToClients,
} from './core/workspace/client.browser';

// Note: createServer is NOT exported in browser builds (Node.js only)
