/**
 * Browser-specific epicenter exports.
 *
 * This file is selected by bundlers when the "browser" condition is matched.
 */

// Runtime - browser version
export { createEpicenterClient } from './client.browser';
// Types from shared (no platform-specific code)
export type { ActionInfo, EpicenterClient } from './client.shared';
// Runtime utilities (shared)
export { iterActions } from './client.shared';

// Config types and definition (browser-specific - no storageDir)
export type { EpicenterConfig } from './config.browser';
export { defineEpicenter } from './config.browser';
