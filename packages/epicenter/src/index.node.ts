/**
 * Node.js entry point for Epicenter.
 *
 * This file is selected by bundlers when the "node" condition is matched
 * or as the default entry point.
 */

// All platform-agnostic exports
export * from './index.shared';

// Node-specific: client creation with options (projectDir)
export {
	createClient,
	type CreateClientOptions,
} from './core/workspace/client.node';

// Node-specific client types
export type {
	EpicenterClient,
	WorkspaceClient,
	WorkspacesToClients,
} from './core/workspace/client.node';

// Node-only: server functionality
export { createServer } from './server';
