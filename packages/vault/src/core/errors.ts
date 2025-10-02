import { createTaggedError } from 'wellcrafted/error';

/**
 * Base error type for vault operations
 */
export const { VaultOperationError, VaultOperationErr } = createTaggedError(
	'VaultOperationError',
);
export type VaultOperationError = ReturnType<typeof VaultOperationError>;
