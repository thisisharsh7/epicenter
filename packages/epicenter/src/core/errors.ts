import { createTaggedError } from 'wellcrafted/error';

/**
 * Base error type for epicenter operations
 */
export const { EpicenterOperationError, EpicenterOperationErr } =
	createTaggedError('EpicenterOperationError');
export type EpicenterOperationError = ReturnType<
	typeof EpicenterOperationError
>;

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

// Legacy aliases for backwards compatibility
export const IndexError = ProviderError;
export const IndexErr = ProviderErr;
export type IndexError = ProviderError;

/**
 * Error type for validation failures
 * Indicates that a row exists but doesn't match the table schema
 */
export const { ValidationError, ValidationErr } =
	createTaggedError('ValidationError');
export type ValidationError = ReturnType<typeof ValidationError>;
