/**
 * Default Epicenter exports (Node.js).
 *
 * Internal code (tests, CLI, server) imports from this file.
 * These are all Node-only contexts, so we re-export the node version.
 *
 * External consumers should use conditional exports via package.json,
 * which routes to index.node.ts or index.browser.ts automatically.
 */

export * from './index.node';
