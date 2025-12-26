/**
 * Node.js entry point for Epicenter.
 *
 * This file is selected by bundlers when the "node" condition is matched
 * or as the default entry point.
 */

// All platform-agnostic exports
export * from './index.shared';

// Node-specific: client creation with options (storageDir)
export {
	createClient,
	type CreateClientOptions,
} from './core/workspace/client.node';

// Client types (shared across platforms)
export type {
	EpicenterClient,
	WorkspaceClient,
	WorkspacesToClients,
} from './core/workspace/client.shared';

// Node-only: server functionality
export { createServer } from './server';
