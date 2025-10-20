import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import {
	CallToolRequestSchema,
	ErrorCode,
	ListToolsRequestSchema,
	McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { Value } from 'typebox/value';
import type { Action } from '../core/actions';
import type { EpicenterConfig } from '../core/epicenter';
import { createEpicenterClient } from '../core/epicenter';
import type { AnyWorkspaceConfig } from '../core/workspace';

/**
 * Collect all actions from all workspaces into a Map
 */
export async function collectActions<
	TId extends string,
	TWorkspaces extends readonly AnyWorkspaceConfig[],
>(config: EpicenterConfig<TId, TWorkspaces>): Promise<{
	client: Awaited<ReturnType<typeof createEpicenterClient<TId, TWorkspaces>>>;
	actions: Map<string, Action>;
}> {
	const client = await createEpicenterClient(config);
	const actions = new Map<string, Action>();

	for (const workspace of config.workspaces) {
		const workspaceClient = client[workspace.name as keyof typeof client];

		const handlerNames = Object.keys(workspaceClient as any).filter(
			(key) => typeof workspaceClient[key] === 'function' && key !== 'destroy'
		);

		for (const actionName of handlerNames) {
			const action = workspaceClient[actionName];
			const mcpToolName = `${workspace.name}_${actionName}`;
			actions.set(mcpToolName, action);
		}
	}

	return { client, actions };
}

/**
 * Configure MCP server with request handlers for tools/list and tools/call
 */
export function setupMcpHandlers(
	mcpServer: McpServer,
	actions: Map<string, Action>
): void {
	// List tools handler
	mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: Array.from(actions.entries()).map(([name, action]) => ({
			name,
			title: name,
			description: action.description ?? `Execute ${name}`,
			inputSchema: action.input ?? {
				type: 'object' as const,
				properties: {},
			},
		})),
	}));

	// Call tool handler
	mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
		const action = actions.get(request.params.name);

		if (!action || typeof action !== 'function') {
			throw new McpError(
				ErrorCode.InvalidParams,
				`Unknown tool: ${request.params.name}`
			);
		}

		const args = request.params.arguments || {};

		// Validate input with TypeBox
		if (action.input) {
			if (!Value.Check(action.input, args)) {
				const errors = [...Value.Errors(action.input, args)];
				throw new McpError(
					ErrorCode.InvalidParams,
					`Invalid input for ${request.params.name}: ${JSON.stringify(
						errors.map((e) => ({
							path: e.path,
							message: e.message,
						}))
					)}`
				);
			}
		}

		// Execute action
		const result = action.input ? await action(args) : await action();

		// Validate output schema if present
		if (action.output && result.data !== undefined) {
			if (!Value.Check(action.output, result.data)) {
				const errors = [...Value.Errors(action.output, result.data)];
				throw new McpError(
					ErrorCode.InternalError,
					`Output validation failed for ${request.params.name}: ${JSON.stringify(
						errors.map((e) => ({
							path: e.path,
							message: e.message,
						}))
					)}`
				);
			}
		}

		// Handle Result<T, E> format
		if (result.error) {
			return {
				content: [
					{
						type: 'text' as const,
						text: JSON.stringify({
							error: result.error.message || 'Unknown error',
						}),
					},
				],
				isError: true,
			};
		}

		return {
			content: [
				{
					type: 'text' as const,
					text: JSON.stringify(result.data),
				},
			],
			structuredContent: result.data,
		};
	});
}
