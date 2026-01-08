/**
 * Markdown capability - Bidirectional sync between YJS and markdown files
 *
 * Main entry point for the markdown capability. Exports the markdown function
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
	// Pre-built serializer factories
	bodyFieldSerializer,
	defaultSerializer,
	// Builder for custom serializers with full type inference
	defineSerializer,
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

// Main capability implementation and core exports
export type { MarkdownCapabilityConfig } from './markdown';
export {
	markdown,
	MarkdownCapabilityErr,
	MarkdownCapabilityError,
} from './markdown';
