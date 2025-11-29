/**
 * MIME type utilities.
 *
 * Re-exports from the `mime` package, the de facto standard for MIME type
 * handling in JavaScript. Zero external dependencies, works in browser and Node.js.
 *
 * @see https://github.com/broofa/mime
 */
import mimeInstance from 'mime';

export { default as mime } from 'mime';

/**
 * Get MIME type from path or extension.
 *
 * @param path - File path, filename, or extension
 * @returns MIME type, or 'application/octet-stream' if unknown
 *
 * @example
 * getType('png')              // 'image/png'
 * getType('.mp3')             // 'audio/mpeg'
 * getType('document.pdf')     // 'application/pdf'
 */
export function getType(path: string): string {
	return mimeInstance.getType(path) ?? 'application/octet-stream';
}

/**
 * Get file extension from MIME type.
 *
 * @param mimeType - MIME type (e.g., 'audio/mpeg')
 * @returns Extension without dot (e.g., 'mp3'), or empty string if unknown
 *
 * @example
 * getExtension('audio/mpeg')  // 'mp3'
 * getExtension('image/jpeg')  // 'jpeg'
 */
export function getExtension(mimeType: string): string {
	return mimeInstance.getExtension(mimeType) ?? '';
}
