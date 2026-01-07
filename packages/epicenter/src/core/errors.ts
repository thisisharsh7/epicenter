import { createTaggedError } from 'wellcrafted/error';

/**
 * Context type for provider operation errors
 * Used for structured logging with table/file context
 */
type ProviderErrorContext = {
	tableName?: string;
	rowId?: string;
	filename?: string;
	filePath?: string;
	directory?: string;
	operation?: string;
};

/**
 * Error type for provider operations
 * Includes optional context for structured logging
 */
export const { ProviderError, ProviderErr } = createTaggedError(
	'ProviderError',
).withContext<ProviderErrorContext | undefined>();
export type ProviderError = ReturnType<typeof ProviderError>;
