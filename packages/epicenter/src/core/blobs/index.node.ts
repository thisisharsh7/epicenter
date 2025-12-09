/**
 * Node.js blob storage entry point.
 * Uses filesystem with Bun APIs for blob storage.
 *
 * This file is selected by bundlers when the "node" condition is matched.
 */

import { join } from 'node:path';
import { createNodeTableBlobStore } from './node.js';
import type { TableBlobStore, WorkspaceBlobs } from './types.js';

export { createNodeTableBlobStore as createTableBlobStore } from './node.js';

/**
 * Context passed to createWorkspaceBlobs.
 * Similar to IndexContext but without db (blobs don't need database access).
 */
export type BlobStoreContext<TSchema extends Record<string, unknown>> = {
	/** Workspace ID (used as parent directory for blob storage) */
	id: string;
	/** Workspace schema (table names become subdirectories) */
	schema: TSchema;
	/** Base storage directory (required for Node/Bun) */
	storageDir: string;
};

/**
 * Create blob stores for all tables in a workspace schema.
 * Returns an object keyed by table name.
 *
 * @example
 * ```typescript
 * const blobs = await createWorkspaceBlobs({
 *   id: 'my-workspace',
 *   schema: {
 *     posts: table({ ... }),
 *     users: table({ ... }),
 *   },
 *   storageDir: '/path/to/storage',
 * });
 * // blobs.posts, blobs.users are now available
 *
 * await blobs.posts.put('attachment.pdf', file);
 * await blobs.users.put('avatar.png', imageData);
 * ```
 *
 * @param context.id - Workspace ID (used as parent directory)
 * @param context.schema - The workspace schema object
 * @param context.storageDir - The base storage directory
 * @returns WorkspaceBlobs object with stores for each table
 */
export function createWorkspaceBlobs<TSchema extends Record<string, unknown>>(
	context: BlobStoreContext<TSchema>,
): WorkspaceBlobs<TSchema> {
	const { id, schema, storageDir } = context;

	// Construct the workspace-specific storage path
	// Storage layout: {storageDir}/{workspaceId}/{tableName}/{filename}
	const workspaceStorageDir = join(storageDir, id);

	const tableNames = Object.keys(schema);
	const stores = tableNames.map((tableName) => [
		tableName,
		createNodeTableBlobStore(workspaceStorageDir, tableName),
	]);
	return Object.fromEntries(stores) as WorkspaceBlobs<TSchema>;
}

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
