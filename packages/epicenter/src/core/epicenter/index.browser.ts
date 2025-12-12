/**
 * Browser-specific epicenter exports.
 *
 * This file is selected by bundlers when the "browser" condition is matched.
 */

// Runtime and types - browser version
export { createEpicenterClient } from './client.browser';
export type { ActionInfo, EpicenterClient } from './client.browser';
export { iterActions } from './client.browser';

// Config types and definition (browser-specific - no storageDir)
export type { EpicenterConfig } from './config.browser';
export { defineEpicenter } from './config.browser';
