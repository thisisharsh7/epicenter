import { Ok } from 'wellcrafted/result';
import { BlobErr } from './types.js';

/**
 * Filename validation pattern.
 * - Must start with alphanumeric character
 * - Can contain dots, underscores, and hyphens
 * - Must end with a file extension
 *
 * Valid examples: "file.png", "file.tar.gz", "v1.2.3.zip", "my_file-2024.pdf"
 * Invalid examples: ".hidden", "-start.txt", "../traversal.txt"
 */
const FILENAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.[a-zA-Z0-9]+$/;

/**
 * Validate a filename for blob storage.
 *
 * Valid format: `[a-zA-Z0-9][a-zA-Z0-9._-]*\.[a-zA-Z0-9]+`
 * - Must start with alphanumeric character
 * - Middle can contain letters, numbers, dots, underscores, hyphens
 * - Must end with a file extension (e.g., `.png`, `.tar.gz`)
 * - No path separators (`/`, `\`) or traversal (`..`)
 *
 * @example
 * // Valid
 * validateFilename('avatar.png')      // Ok
 * validateFilename('file_v1.2.tar.gz') // Ok
 * validateFilename('my-file-2024.pdf') // Ok
 *
 * // Invalid
 * validateFilename('.hidden')          // Err (starts with dot)
 * validateFilename('path/to/file.txt') // Err (contains /)
 * validateFilename('../escape.txt')    // Err (path traversal)
 *
 * @param filename The filename to validate
 * @returns Ok(undefined) if valid, BlobErr if invalid
 */
export function validateFilename(filename: string) {
	// Security: prevent path traversal
	if (
		filename.includes('/') ||
		filename.includes('\\') ||
		filename.includes('..')
	) {
		return BlobErr({
			message: `Invalid filename: ${filename}. Path separators and traversal not allowed.`,
			context: { filename, code: 'INVALID_FILENAME' },
			cause: undefined,
		});
	}

	if (!FILENAME_PATTERN.test(filename)) {
		return BlobErr({
			message: `Invalid filename: ${filename}. Must start with alphanumeric and end with extension (e.g., "file.png", "archive.tar.gz")`,
			context: { filename, code: 'INVALID_FILENAME' },
			cause: undefined,
		});
	}

	return Ok(undefined);
}

/**
 * Common MIME types for blob storage.
 * Falls back to 'application/octet-stream' for unknown extensions.
 */
const MIME_TYPES: Record<string, string> = {
	// Images
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	svg: 'image/svg+xml',
	ico: 'image/x-icon',
	bmp: 'image/bmp',
	tiff: 'image/tiff',
	tif: 'image/tiff',

	// Documents
	pdf: 'application/pdf',
	doc: 'application/msword',
	docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	xls: 'application/vnd.ms-excel',
	xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	ppt: 'application/vnd.ms-powerpoint',
	pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',

	// Text
	txt: 'text/plain',
	md: 'text/markdown',
	html: 'text/html',
	htm: 'text/html',
	css: 'text/css',
	csv: 'text/csv',
	xml: 'text/xml',

	// Code
	js: 'application/javascript',
	mjs: 'application/javascript',
	ts: 'text/typescript',
	json: 'application/json',
	yaml: 'text/yaml',
	yml: 'text/yaml',

	// Audio
	mp3: 'audio/mpeg',
	wav: 'audio/wav',
	ogg: 'audio/ogg',
	m4a: 'audio/mp4',
	flac: 'audio/flac',
	aac: 'audio/aac',
	webm: 'audio/webm',

	// Video
	mp4: 'video/mp4',
	avi: 'video/x-msvideo',
	mov: 'video/quicktime',
	mkv: 'video/x-matroska',

	// Archives
	zip: 'application/zip',
	gz: 'application/gzip',
	tar: 'application/x-tar',
	rar: 'application/vnd.rar',
	'7z': 'application/x-7z-compressed',

	// Fonts
	woff: 'font/woff',
	woff2: 'font/woff2',
	ttf: 'font/ttf',
	otf: 'font/otf',
	eot: 'application/vnd.ms-fontobject',
};

/**
 * Get the MIME type for a filename based on its extension.
 *
 * @param filename The filename to get the MIME type for
 * @returns The MIME type, or 'application/octet-stream' if unknown
 */
export function getMimeType(filename: string): string {
	const ext = filename.split('.').pop()?.toLowerCase();
	return MIME_TYPES[ext ?? ''] ?? 'application/octet-stream';
}
