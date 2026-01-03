/**
 * Node.js entry point for Epicenter.
 *
 * This file is selected by bundlers when the "node" condition is matched
 * or as the default entry point.
 */

export * from './index.shared';
export { createServer } from './server';
