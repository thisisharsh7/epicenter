import { basename } from '@tauri-apps/api/path';
import { readFile } from '@tauri-apps/plugin-fs';
import mime from 'mime';
import { extractErrorMessage } from 'wellcrafted/error';
import { tryAsync } from 'wellcrafted/result';
import type { FsService } from './types';
import { FsServiceErr } from './types';

/** Get MIME type from file path. The mime library handles path parsing internally. */
function getMimeType(filePath: string): string {
	return mime.getType(filePath) ?? 'application/octet-stream';
}

export function createFsServiceDesktop(): FsService {
	return {
		pathToBlob: async (path: string) => {
			return tryAsync({
				try: async () => {
					const fileBytes = await readFile(path);
					const mimeType = getMimeType(path);
					// Cast is safe: Tauri's readFile always returns ArrayBuffer-backed Uint8Array, never SharedArrayBuffer
					return new Blob([fileBytes as Uint8Array<ArrayBuffer>], { type: mimeType });
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
					const fileBytes = await readFile(path);
					const fileName = await basename(path);
					const mimeType = getMimeType(path);
					// Cast is safe: Tauri's readFile always returns ArrayBuffer-backed Uint8Array, never SharedArrayBuffer
					return new File([fileBytes as Uint8Array<ArrayBuffer>], fileName, { type: mimeType });
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
						const fileBytes = await readFile(path);
						const fileName = await basename(path);
						const mimeType = getMimeType(path);
						// Cast is safe: Tauri's readFile always returns ArrayBuffer-backed Uint8Array, never SharedArrayBuffer
						const file = new File([fileBytes as Uint8Array<ArrayBuffer>], fileName, { type: mimeType });
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
