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
 * Context type for index operation errors
 * Used for structured logging with table/file context
 */
type IndexErrorContext = {
	tableName?: string;
	rowId?: string;
	filename?: string;
	filePath?: string;
	directory?: string;
	operation?: string;
};

/**
 * Error type for index operations
 * Includes optional context for structured logging
 */
export const { IndexError, IndexErr } = createTaggedError(
	'IndexError',
).withContext<IndexErrorContext | undefined>();
export type IndexError = ReturnType<typeof IndexError>;

/**
 * Error type for validation failures
 * Indicates that a row exists but doesn't match the table schema
 */
export const { ValidationError, ValidationErr } =
	createTaggedError('ValidationError');
export type ValidationError = ReturnType<typeof ValidationError>;
