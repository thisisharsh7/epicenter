/**
 * Markdown provider - Bidirectional sync between YJS and markdown files
 *
 * Main entry point for the markdown provider. Exports the markdownProvider function
 * and utilities for custom serializers and error handling.
 */

// Table config factories and types
export type { TableMarkdownConfig, WithBodyFieldOptions } from './configs';
export { sanitizeFilename, withBodyField, withTitleFilename } from './configs';

// Markdown file operations
export type { MarkdownOperationError } from './io';
export {
	deleteMarkdownFile,
	listMarkdownFiles,
	readMarkdownFile,
	writeMarkdownFile,
} from './io';

// Main provider implementation and core exports
export type { MarkdownProviderConfig } from './markdown-provider';
export {
	DEFAULT_TABLE_CONFIG,
	MarkdownProviderErr,
	MarkdownProviderError,
	markdownProvider,
} from './markdown-provider';
