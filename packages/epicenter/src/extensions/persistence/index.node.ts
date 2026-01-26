/**
 * Bun/Desktop persistence provider entry point.
 * Uses filesystem for YJS document persistence.
 *
 * This file is selected by bundlers when the "node" condition is matched
 * in package.json exports. Despite the filename, this targets Bun runtime
 * specifically (uses Bun.file API for reading).
 */
export { persistence, type PersistenceConfig } from './desktop.js';
