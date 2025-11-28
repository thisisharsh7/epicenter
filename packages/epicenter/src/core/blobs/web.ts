import { Ok, t, tryAsync, tryAsync, type Result } from 'wellcrafted/result';
import type { BlobError, TableBlobStore } from './types.js';
import { BlobErr } from './types.js';
import { validateFilename } from './utils.js';

/**
 * Create a blob store for a table using OPFS (Origin Private File System).
 * This implementation is used in browser environments.
 *
 * OPFS provides a sandboxed filesystem accessible only to the current origin,
 * with no user permission prompts required.
 *
 * @param tableName The table name (used as subdirectory in OPFS)
 * @returns A TableBlobStore implementation
 */
export function createWebTableBlobStore(tableName: string): TableBlobStore {
	return {
		async put(filename, data) {
			const validation = validateFilename(filename);
			if (validation.error) return validation;

			return tryAsync({
				try: async () => {
					const root = await navigator.storage.getDirectory();
					const tableDir = await root.getDirectoryHandle(tableName, {
						create: true,
					});

					const fileHandle = await tableDir.getFileHandle(filename, {
						create: true,
					});
					const writable = await fileHandle.createWritable();
					await writable.write(data);
					await writable.close();
				},
				catch: (error) =>
					BlobErr({
						message: `Failed to write blob: ${filename}`,
						context: { filename, code: 'WRITE_FAILED' },
						cause: error,
					}),
			});
		},

		async get(filename) {
			const validation = validateFilename(filename);
			if (validation.error) return validation;

			return tryAsync({
				try: async () => {
					const root = await navigator.storage.getDirectory();
					const tableDir = await root.getDirectoryHandle(tableName);
					const fileHandle = await tableDir.getFileHandle(filename);
					const file = await fileHandle.getFile();
					return file as Blob;
				},
				catch: (error) => {
					// NotFoundError means file doesn't exist - return null, not error
					if ((error as { name?: string }).name === 'NotFoundError') {
						return Ok(null);
					}
					return BlobErr({
						message: `Failed to read blob: ${filename}`,
						context: { filename, code: 'READ_FAILED' },
						cause: error,
					});
				},
			});
		},

		async delete(filename) {
			const validation = validateFilename(filename);
			if (validation.error) return validation;

			return tryAsync({
				try: async () => {
					const root = await navigator.storage.getDirectory();
					const tableDir = await root.getDirectoryHandle(tableName);
					await tableDir.removeEntry(filename);
				},
				catch: (error) => {
					// NotFoundError means already deleted - that's fine
					if ((error as { name?: string }).name === 'NotFoundError') {
						return Ok(undefined);
					}
					return BlobErr({
						message: `Failed to delete blob: ${filename}`,
						context: { filename, code: 'DELETE_FAILED' },
						cause: error,
					});
				},
			});
		},

		async exists(filename): Promise<Result<boolean, BlobError>> {
			const validation = validateFilename(filename);
			if (validation.error) return validation;

			return tryAsync({
				try: async () => {
					const root = await navigator.storage.getDirectory();
					const tableDir = await root.getDirectoryHandle(tableName);
					await tableDir.getFileHandle(filename);
					return true;
				},
				catch: () => Ok(false),
			});
		},
	};
}
