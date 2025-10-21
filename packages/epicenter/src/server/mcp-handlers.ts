import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import {
	CallToolRequestSchema,
	ErrorCode,
	ListToolsRequestSchema,
	McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { Value } from 'typebox/value';
import type { Action } from '../core/actions';
import type { EpicenterClient, EpicenterConfig } from '../core/epicenter';
import type { AnyWorkspaceConfig } from '../core/workspace';

/**
 * Create and configure an MCP server with tool handlers.
 *
 * @param client - The hierarchical EpicenterClient with workspace namespaces
 * @param config - Epicenter configuration containing server ID and workspaces
 * @returns Configured MCP server instance ready to connect to a transport
 */
export function createMcpServer<
	TId extends string,
	TWorkspaces extends readonly AnyWorkspaceConfig[],
>(
	client: EpicenterClient<TWorkspaces>,
	config: EpicenterConfig<TId, TWorkspaces>
): McpServer {
	const mcpServer = new McpServer(
		{
			name: config.id,
			version: '1.0.0',
		},
		{
			capabilities: {
				tools: {
					listChanged: false,
				},
			},
		}
	);

	const actions = flattenActionsForMCP(client, config.workspaces);

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
							path: e.instancePath,
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
							path: e.instancePath,
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

		// MCP protocol requires structuredContent to be an object, not an array
		// Wrap arrays in an object with a semantic key derived from the action name
		const structuredContent = Array.isArray(result.data)
			? { [deriveCollectionKey(request.params.name)]: result.data }
			: result.data;

		return {
			content: [
				{
					type: 'text' as const,
					text: JSON.stringify(result.data),
				},
			],
			structuredContent,
		};
	});

	return mcpServer;
}

/**
 * Flatten workspace actions into a Map suitable for MCP server registration.
 *
 * Takes a hierarchical EpicenterClient and flattens all workspace actions into a Map
 * with MCP-compatible tool names. This is specifically for the MCP protocol which requires
 * a flat list of tools.
 */
function flattenActionsForMCP<TWorkspaces extends readonly AnyWorkspaceConfig[]>(
	client: EpicenterClient<TWorkspaces>,
	workspaces: TWorkspaces
): Map<string, Action> {
	const actions = new Map<string, Action>();

	for (const workspace of workspaces) {
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

	return actions;
}

/**
 * Derives a semantic collection key from an MCP tool name for wrapping array responses.
 *
 * MCP protocol requires `structuredContent` to be an object, not an array. When an action
 * returns an array, we wrap it in an object with a semantically meaningful key derived from
 * the action name using deterministic transformation rules.
 *
 * @param mcpToolName - The full MCP tool name in format `${workspaceName}_${actionName}`
 * @returns A camelCase key for wrapping arrays, or "items" if derivation fails
 *
 * @example
 * deriveCollectionKey("pages_getPages")           // → "pages"
 * deriveCollectionKey("content_listArticles")     // → "articles"
 * deriveCollectionKey("users_fetchActiveUsers")   // → "activeUsers"
 * deriveCollectionKey("posts_searchByTag")        // → "byTag"
 * deriveCollectionKey("workspace_get")            // → "items" (empty after prefix removal)
 * deriveCollectionKey("invalid")                  // → "items" (no underscore separator)
 *
 * Transformation rules:
 * 1. Extract action name by taking everything after the last underscore
 * 2. Remove common query verb prefixes: get, list, fetch, find, search, query
 * 3. Convert first character to lowercase for camelCase convention
 * 4. Return "items" as fallback for edge cases (no action name or empty result)
 */
function deriveCollectionKey(mcpToolName: string): string {
	const DEFAULT_KEY = 'items';

	// Extract action name after workspace prefix (e.g., "pages_getPages" → "getPages")
	const actionName = mcpToolName.split('_').pop();
	if (!actionName) return DEFAULT_KEY;

	// Remove common query/fetch verb prefixes
	const cleaned = actionName.replace(/^(get|list|fetch|find|search|query)/, '');
	if (!cleaned) return DEFAULT_KEY;

	// Lowercase first character
	return cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
}
