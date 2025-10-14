import type { Context } from 'hono';
import type { EpicenterOperationError } from '../core/errors';

/**
 * Map EpicenterOperationError to HTTP status code
 */
function getStatusCodeForError(error: EpicenterOperationError): number {
	// Check error message to determine appropriate status
	const message = (error.message || '').toUpperCase();

	if (message.includes('NOT FOUND') || message.includes('NOT_FOUND')) return 404;
	if (message.includes('VALIDATION') || message.includes('INVALID')) return 400;
	if (message.includes('UNAUTHORIZED') || message.includes('UNAUTHENTICATED')) return 401;
	if (message.includes('FORBIDDEN')) return 403;
	if (message.includes('CONFLICT') || message.includes('ALREADY EXISTS')) return 409;

	// Default to 500 for unknown errors
	return 500;
}

/**
 * Execute an action handler and format the response
 * Workspace client handlers return { data, error } format
 */
export async function executeAction<T>(
	c: Context,
	handler: (input: any) => Promise<{ data?: T; error?: EpicenterOperationError }>,
	input: any,
) {
	try {
		const result = await handler(input);

		// Workspace handlers return { data, error } format
		if (result.error) {
			const status = getStatusCodeForError(result.error);
			return c.json(
				{
					error: {
						message: result.error.message || 'An error occurred',
						...(result.error.cause && { cause: String(result.error.cause) }),
					},
				},
				status,
			);
		}

		// Success case
		return c.json({ data: result.data });
	} catch (error) {
		// Handle unexpected errors that weren't wrapped properly
		console.error('Unexpected error in action handler:', error);
		return c.json(
			{
				error: {
					message: error instanceof Error ? error.message : 'An unexpected error occurred',
				},
			},
			500,
		);
	}
}
