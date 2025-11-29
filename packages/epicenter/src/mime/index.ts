/**
 * Comprehensive MIME type mappings.
 * Single source of truth for extension <-> MIME type mappings.
 */
export const MIME_TYPE_MAP = {
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
	m4a: 'audio/mp4',
	aac: 'audio/aac',
	ogg: 'audio/ogg',
	flac: 'audio/flac',
	wma: 'audio/x-ms-wma',
	opus: 'audio/opus',
	webm: 'audio/webm',

	// Video
	mp4: 'video/mp4',
	avi: 'video/x-msvideo',
	mov: 'video/quicktime',
	mkv: 'video/x-matroska',
	wmv: 'video/x-ms-wmv',
	flv: 'video/x-flv',
	m4v: 'video/mp4',

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
} as const;

export type Extension = keyof typeof MIME_TYPE_MAP;
export type MimeType = (typeof MIME_TYPE_MAP)[Extension];

/**
 * Reverse mapping: MIME type -> extension.
 * Derived from MIME_TYPE_MAP, with browser aliases added.
 */
const EXTENSION_MAP: Record<string, string> = Object.entries(
	MIME_TYPE_MAP,
).reduce(
	(acc, [ext, mime]) => {
		// For duplicate MIME types (e.g., jpg/jpeg), prefer the first extension
		if (!acc[mime]) {
			acc[mime] = ext;
		}
		return acc;
	},
	{} as Record<string, string>,
);

// Browser alias: Some browsers report 'audio/wave' instead of 'audio/wav'
EXTENSION_MAP['audio/wave'] = 'wav';
// Browser alias: Alternative WAV MIME type
EXTENSION_MAP['audio/x-wav'] = 'wav';
// Browser alias: Some browsers report 'audio/mp3' instead of 'audio/mpeg'
EXTENSION_MAP['audio/mp3'] = 'mp3';

/**
 * Get MIME type from path or extension.
 *
 * Follows the same API convention as the `mime` npm package.
 *
 * @param pathOrExtension - File path, filename, or extension (with or without dot)
 * @returns MIME type, or 'application/octet-stream' if unknown
 *
 * @example
 * getType('png')              // 'image/png'
 * getType('.mp3')             // 'audio/mpeg'
 * getType('document.pdf')     // 'application/pdf'
 * getType('dir/file.txt')     // 'text/plain'
 */
export function getType(pathOrExtension: string): string {
	// Extract extension from path/filename, or use as-is if no dot
	const ext = pathOrExtension.includes('.')
		? pathOrExtension.split('.').pop()?.toLowerCase()
		: pathOrExtension.toLowerCase();

	return MIME_TYPE_MAP[ext as Extension] ?? 'application/octet-stream';
}

/**
 * Get file extension from MIME type.
 *
 * Follows the same API convention as the `mime` npm package.
 *
 * @param mimeType - MIME type (e.g., 'audio/mpeg')
 * @returns Extension without dot (e.g., 'mp3'), or empty string if unknown
 *
 * @example
 * getExtension('audio/mpeg')  // 'mp3'
 * getExtension('audio/wave')  // 'wav' (browser alias)
 * getExtension('image/jpeg')  // 'jpg'
 */
export function getExtension(mimeType: string): string {
	return EXTENSION_MAP[mimeType] ?? '';
}
