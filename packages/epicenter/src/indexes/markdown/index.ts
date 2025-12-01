/**
 * Markdown index - Bidirectional sync between YJS and markdown files
 *
 * Main entry point for the markdown index. Exports the markdownIndex function
 * and utilities for custom serializers and error handling.
 */

export type { MarkdownOperationError } from './io';
// Markdown file operations
export {
	deleteMarkdownFile,
	listMarkdownFiles,
	readMarkdownFile,
	writeMarkdownFile,
} from './io';
// Types
export type { MarkdownIndexConfig, WithBodyFieldOptions } from './markdown-index';
// Main index implementation
// Error types for custom serializers
// Factory function for common table config pattern
export {
	MarkdownIndexErr,
	MarkdownIndexError,
	markdownIndex,
	withBodyField,
} from './markdown-index';
