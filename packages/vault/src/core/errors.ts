import { createTaggedError } from 'wellcrafted/error';

/**
 * Base error type for vault operations
 */
export const { VaultOperationError, VaultOperationErr } = createTaggedError(
	'VaultOperationError',
);
export type VaultOperationError = ReturnType<typeof VaultOperationError>;

/**
 * Database operation errors (SQLite failures)
 */
export const { DatabaseError, DatabaseErr } = createTaggedError(
	'DatabaseError',
);
export type DatabaseError = ReturnType<typeof DatabaseError>;

/**
 * Validation errors (schema validation failures)
 */
export const { ValidationError, ValidationErr } = createTaggedError(
	'ValidationError',
);
export type ValidationError = ReturnType<typeof ValidationError>;

/**
 * File system errors (markdown file operations)
 */
export const { FileSystemError, FileSystemErr } = createTaggedError(
	'FileSystemError',
);
export type FileSystemError = ReturnType<typeof FileSystemError>;

/**
 * Not found errors (record doesn't exist)
 */
export const { NotFoundError, NotFoundErr } = createTaggedError(
	'NotFoundError',
);
export type NotFoundError = ReturnType<typeof NotFoundError>;

/**
 * Conflict errors (duplicate ID or concurrent modification)
 */
export const { ConflictError, ConflictErr } = createTaggedError(
	'ConflictError',
);
export type ConflictError = ReturnType<typeof ConflictError>;