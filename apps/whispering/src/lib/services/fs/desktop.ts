import { basename } from '@tauri-apps/api/path';
import { readFile } from '@tauri-apps/plugin-fs';
import mime from 'mime';
import { extractErrorMessage } from 'wellcrafted/error';
import { tryAsync } from 'wellcrafted/result';
import type { FsService } from './types';
import { FsServiceErr } from './types';

/**
 * Reads a file and returns its bytes with the correct type for Blob/File constructors,
 * along with the inferred MIME type.
 *
 * Tauri's readFile always returns ArrayBuffer-backed Uint8Array, never SharedArrayBuffer,
 * so the cast is safe.
 */
async function readFileWithMimeType(path: string): Promise<{
	bytes: Uint8Array<ArrayBuffer>;
	mimeType: string;
}> {
	const bytes = (await readFile(path)) as Uint8Array<ArrayBuffer>;
	const mimeType = mime.getType(path) ?? 'application/octet-stream';
	return { bytes, mimeType };
}

export function createFsServiceDesktop(): FsService {
	return {
		pathToBlob: async (path: string) => {
			return tryAsync({
				try: async () => {
					const { bytes, mimeType } = await readFileWithMimeType(path);
					return new Blob([bytes], { type: mimeType });
				},
				catch: (error) =>
					FsServiceErr({
						message: `Failed to read file as Blob: ${path}: ${extractErrorMessage(error)}`,
					}),
			});
		},

		pathToFile: async (path: string) => {
			return tryAsync({
				try: async () => {
					const { bytes, mimeType } = await readFileWithMimeType(path);
					const fileName = await basename(path);
					return new File([bytes], fileName, { type: mimeType });
				},
				catch: (error) =>
					FsServiceErr({
						message: `Failed to read file as File: ${path}: ${extractErrorMessage(error)}`,
					}),
			});
		},

		pathsToFiles: async (paths: string[]) => {
			return tryAsync({
				try: async () => {
					const files: File[] = [];
					for (const path of paths) {
						const { bytes, mimeType } = await readFileWithMimeType(path);
						const fileName = await basename(path);
						const file = new File([bytes], fileName, { type: mimeType });
						files.push(file);
					}
					return files;
				},
				catch: (error) =>
					FsServiceErr({
						message: `Failed to read files: ${paths.join(', ')}: ${extractErrorMessage(error)}`,
					}),
			});
		},
	};
}
