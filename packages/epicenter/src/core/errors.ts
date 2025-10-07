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
 * Error type for index operations
 */
export const { IndexError, IndexErr } = createTaggedError('IndexError');
export type IndexError = ReturnType<typeof IndexError>;

/**
 * Error type for validation failures
 * Indicates that a row exists but doesn't match the table schema
 */
export const { ValidationError, ValidationErr } =
	createTaggedError('ValidationError');
export type ValidationError = ReturnType<typeof ValidationError>;

/**
 * Error type for row not found
 * Indicates that a requested row ID doesn't exist in the table
 */
export const { RowNotFoundError, RowNotFoundErr } =
	createTaggedError('RowNotFoundError');
export type RowNotFoundError = ReturnType<typeof RowNotFoundError>;
