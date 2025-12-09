/**
 * Browser entry point for Epicenter.
 *
 * This file is selected by bundlers when the "browser" condition is matched.
 * It excludes Node.js-specific exports like createServer.
 */

// All platform-agnostic exports
export * from './index.shared';

// Browser-specific: EpicenterConfig type (no storageDir)
export type { EpicenterConfig } from './core/epicenter/config.browser';
export { defineEpicenter } from './core/epicenter/config.browser';

// Browser-specific: runtime functions
export { createEpicenterClient } from './core/epicenter/client.browser';
export { createWorkspaceClient } from './core/workspace/client.browser';

// Note: createServer is NOT exported in browser builds (Node.js only)
