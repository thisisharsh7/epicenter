/**
 * Markdown index - Bidirectional sync between YJS and markdown files
 *
 * Main entry point for the markdown index. Exports the markdownIndex function
 * and utilities for custom serializers and error handling.
 */

// Main index implementation
export { markdownIndex } from './markdown-index';

// Types
export type { MarkdownIndexConfig } from './markdown-index';

// Error types for custom serializers
export { MarkdownIndexErr, MarkdownIndexError } from './markdown-index';

// Markdown file operations
export {
	listMarkdownFiles,
	readMarkdownFile,
	writeMarkdownFile,
	deleteMarkdownFile,
} from './operations';
export type { MarkdownOperationError } from './operations';
