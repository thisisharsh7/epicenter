import { createTaggedError } from 'wellcrafted/error';
import type { Result } from 'wellcrafted/result';

/**
 * Supported input type for blob data.
 */
export type BlobData = Blob | File | ArrayBuffer;

/**
 * Error type for blob operations using wellcrafted's createTaggedError pattern.
 *
 * Context should include:
 * - `filename`: The filename that caused the error
 * - `code`: Error code for programmatic handling
 *   - 'INVALID_FILENAME': Filename validation failed
 *   - 'WRITE_FAILED': Failed to write blob
 *   - 'READ_FAILED': Failed to read blob
 *   - 'DELETE_FAILED': Failed to delete blob
 *
 * @example
 * ```typescript
 * return BlobErr({
 *   message: 'Invalid filename: path/to/file.txt',
 *   context: { filename: 'path/to/file.txt', code: 'INVALID_FILENAME' },
 * });
 * ```
 */
export const { BlobError, BlobErr } = createTaggedError('BlobError');
export type BlobError = ReturnType<typeof BlobError>;

/**
 * Blob store for a single table namespace.
 * Provides put/get/delete/exists operations for binary files.
 */
export type TableBlobStore = {
	/**
	 * Store a blob with the given filename.
	 * @param filename Simple filename with extension (e.g., "avatar.png")
	 * @param data Binary data to store
	 */
	put(filename: string, data: BlobData): Promise<Result<void, BlobError>>;

	/**
	 * Retrieve a blob by filename.
	 * @param filename Simple filename with extension
	 * @returns The blob data, or null if not found
	 */
	get(filename: string): Promise<Result<Blob | null, BlobError>>;

	/**
	 * Delete a blob by filename.
	 * @param filename Simple filename with extension
	 */
	delete(filename: string): Promise<Result<void, BlobError>>;

	/**
	 * Check if a blob exists.
	 * @param filename Simple filename with extension
	 */
	exists(filename: string): Promise<Result<boolean, BlobError>>;
};

/**
 * Workspace blob stores, keyed by table name.
 * Automatically derived from the workspace schema.
 *
 * @example
 * ```typescript
 * // Schema: { posts: table(...), users: table(...) }
 * // Results in: { posts: TableBlobStore, users: TableBlobStore }
 *
 * await blobs.posts.put('attachment.pdf', file);
 * await blobs.users.put('avatar.png', imageData);
 * ```
 */
export type WorkspaceBlobs<TSchema extends Record<string, unknown>> = {
	[K in keyof TSchema]: TableBlobStore;
};
