/**
 * Browser blob storage entry point.
 * Uses OPFS (Origin Private File System) for blob storage.
 *
 * This file is selected by bundlers when the "browser" condition is matched.
 */

export { createWebTableBlobStore as createTableBlobStore } from './web.js';

// Re-export types and utilities
export type {
	BlobContext,
	BlobData,
	BlobError,
	BlobErrorCode,
	TableBlobStore,
	WorkspaceBlobs,
} from './types.js';
export { BlobErr } from './types.js';
export { validateFilename } from './utils.js';

// Note: createWorkspaceBlobs is NOT exported in browser builds.
// It requires filesystem path operations which are Node.js-only.
// Browser apps should use createTableBlobStore directly per table.
