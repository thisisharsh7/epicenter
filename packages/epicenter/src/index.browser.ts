/**
 * Browser entry point for Epicenter.
 *
 * This file is selected by bundlers when the "browser" condition is matched.
 * It excludes Node.js-specific exports like createServer.
 */

// All platform-agnostic exports
export * from './index.shared';

// Browser-specific: client creation (no storageDir option)
export { createClient } from './core/workspace/client.browser';

// Client types (shared across platforms)
export type {
	EpicenterClient,
	WorkspaceClient,
	WorkspacesToClients,
} from './core/workspace/client.shared';

// Note: createServer is NOT exported in browser builds (Node.js only)
