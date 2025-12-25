/**
 * Browser-specific epicenter exports.
 *
 * This file is selected by bundlers when the "browser" condition is matched.
 * After the API consolidation, this module only exports action iteration utilities.
 */

// Action iteration utilities (shared)
export type { ActionInfo } from './client.shared';
export { iterActions } from './client.shared';
