/**
 * Node.js entry point for Epicenter.
 *
 * This file is selected by bundlers when the "node" condition is matched
 * or as the default entry point.
 */

// All platform-agnostic exports
export * from './index.shared';

// Node-specific: EpicenterConfig type (has storageDir)
export type { EpicenterConfig } from './core/epicenter/config.node';
export { defineEpicenter } from './core/epicenter/config.node';

// Node-specific: runtime functions
export { createEpicenterClient } from './core/epicenter/client.node';
export { createWorkspaceClient } from './core/workspace/client.node';

// Node-only: server functionality
export { createServer } from './server';
