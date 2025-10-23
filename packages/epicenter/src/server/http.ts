import { StreamableHTTPTransport } from '@hono/mcp';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { createEpicenterClient, type EpicenterClient, type EpicenterConfig } from '../core/epicenter';
import type { EpicenterOperationError } from '../core/errors';
import type { AnyWorkspaceConfig, WorkspaceClient } from '../core/workspace';
import { createMcpServer } from './mcp-handlers';
import type { WorkspaceActionMap } from '../core/actions';

/**
 * Create an HTTP server with REST and MCP endpoints
 *
 * This creates a Hono server that exposes:
 * - REST endpoints: GET/POST /{workspace}/{action}
 * - MCP endpoint: POST /mcp (using Server-Sent Events)
 *
 * @param config - Epicenter configuration with workspaces
 * @returns Object containing the Hono app and initialized Epicenter client
 *
 * @example
 * ```typescript
 * const epicenter = defineEpicenter({
 *   id: 'my-app',
 *   workspaces: [blogWorkspace],
 * });
 *
 * const { app, client } = await createHttpServer(epicenter);
 *
 * // Use app for serving
 * Bun.serve({
 *   fetch: app.fetch,
 *   port: 3913,
 * });
 * ```
 */
export async function createHttpServer<
	TId extends string,
	TWorkspaces extends readonly AnyWorkspaceConfig[],
>(config: EpicenterConfig<TId, TWorkspaces>): Promise<{
	/** Hono web server instance ready to serve with `Bun.serve({ fetch: app.fetch })` */
	app: Hono;
	/** Epicenter client with initialized workspaces and actions */
	client: EpicenterClient<TWorkspaces>;
}> {
	const app = new Hono();

	// Create client
	const client = await createEpicenterClient(config);

	// Register REST endpoints for each workspace action
	const { destroy, ...workspaceClients } = client;
	for (const [workspaceName, workspaceClient] of Object.entries(workspaceClients)) {
		const { destroy, ...workspaceActions } = workspaceClient as WorkspaceClient<WorkspaceActionMap>;

		for (const [actionName, action] of Object.entries(workspaceActions)) {
			const path = `/${workspaceName}/${actionName}`;

			// Register as both GET and POST
			app.get(path, async (c) => {
				const query = c.req.query();
				const input = Object.keys(query).length > 0 ? query : undefined;
				return executeAction(c, action as any, input);
			});

			app.post(path, async (c) => {
				const body = await c.req.json().catch(() => ({}));
				const input = Object.keys(body).length > 0 ? body : undefined;
				return executeAction(c, action as any, input);
			});
		}
	}

	// Create and configure MCP server for /mcp endpoint
	const mcpServer = createMcpServer(client, config);

	// Register MCP endpoint using StreamableHTTPTransport
	app.all('/mcp', async (c) => {
		const transport = new StreamableHTTPTransport();
		await mcpServer.connect(transport);
		return transport.handleRequest(c);
	});

	return { app, client };
}


/**
 * Execute an action handler and format the response
 * Workspace client handlers return { data, error } format
 */
async function executeAction<T>(
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