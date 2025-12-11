/**
 * Node.js persistence provider entry point.
 * Uses filesystem for YJS document persistence.
 *
 * This file is selected by bundlers when the "node" condition is matched
 * in package.json exports.
 */
export { setupPersistence } from './desktop.js';
