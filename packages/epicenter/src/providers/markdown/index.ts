/**
 * Markdown provider - Bidirectional sync between YJS and markdown files
 *
 * Main entry point for the markdown provider. Exports the markdownProvider function
 * and utilities for custom serializers and error handling.
 */

// Table config types and serializer factories
export type {
	BodyFieldSerializerOptions,
	DomainTitleFilenameSerializerOptions,
	MarkdownSerializer,
	ParsedFilename,
	TableMarkdownConfig,
	TitleFilenameSerializerOptions,
} from './configs';
export {
	// Builder for custom serializers with full type inference
	defineSerializer,
	// Pre-built serializer factories
	bodyFieldSerializer,
	defaultSerializer,
	domainTitleFilenameSerializer,
	titleFilenameSerializer,
} from './configs';

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
	MarkdownProviderErr,
	MarkdownProviderError,
	markdownProvider,
} from './markdown-provider';
