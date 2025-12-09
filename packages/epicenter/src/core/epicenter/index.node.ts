/**
 * Node.js-specific epicenter exports.
 *
 * This file is selected by bundlers when the "node" condition is matched.
 */

// Runtime - node version
export { createEpicenterClient } from './client.node';
// Types from shared (no platform-specific code)
export type { ActionInfo, EpicenterClient } from './client.shared';
// Runtime utilities (shared)
export { iterActions } from './client.shared';

// Config types and definition (node-specific - includes storageDir)
export type { EpicenterConfig } from './config.node';
export { defineEpicenter } from './config.node';
