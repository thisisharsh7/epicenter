/**
 * Node.js-specific epicenter exports.
 *
 * This file is selected by bundlers when the "node" condition is matched.
 */

// Runtime and types - node version
export { createEpicenterClient } from './client.node';
export type { ActionInfo, EpicenterClient } from './client.node';
export { iterActions } from './client.node';

// Config types and definition (node-specific - includes storageDir)
export type { EpicenterConfig } from './config.node';
export { defineEpicenter } from './config.node';
