import type { Context } from 'hono';
import type { WorkspaceAction, WorkspaceActionMap } from '../core/actions';
import { executeAction } from './utils';

/**
 * MCP Tool definition following Model Context Protocol spec
 */
export type MCPTool = {
	name: string;
	description?: string;
	inputSchema: {
		type: 'object';
		properties?: Record<string, any>;
		required?: string[];
	};
};

/**
 * MCP tools/list response
 */
export type MCPToolsListResponse = {
	tools: MCPTool[];
};

/**
 * MCP tools/call request
 */
export type MCPToolCallRequest = {
	name: string;
	arguments?: Record<string, any>;
};

/**
 * MCP tools/call response
 */
export type MCPToolCallResponse = {
	content: Array<{
		type: 'text';
		text: string;
	}>;
	isError?: boolean;
};

/**
 * Convert workspace actions to MCP tool definitions
 * For epicenter: tool names are {workspaceName}_{actionName}
 * For workspace: tool names are just {actionName}
 */
export function createMCPTools(
	actions: Record<string, { handler: Function }>,
): MCPTool[] {
	return Object.entries(actions).map(([name]) => ({
		name,
		inputSchema: {
			type: 'object',
			// For now, keep it simple without detailed schema conversion
			// Future: convert StandardSchemaV1 to JSON Schema and add descriptions
		},
	}));
}

/**
 * Handle MCP tools/list request
 */
export function handleMCPToolsList(
	tools: MCPTool[],
): MCPToolsListResponse {
	return { tools };
}

/**
 * Handle MCP tools/call request
 */
export async function handleMCPToolCall(
	c: Context,
	request: MCPToolCallRequest,
	actions: Record<string, { handler: Function }>,
): Promise<MCPToolCallResponse> {
	const actionEntry = actions[request.name];

	if (!actionEntry) {
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify({
						error: `Tool not found: ${request.name}`,
					}),
				},
			],
			isError: true,
		};
	}

	try {
		// Execute the action (actions are now callable directly)
		// Workspace actions return { data, error } format
		const result = await actionEntry(request.arguments || {});

		// Check for error
		if (result.error) {
			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							error: result.error.message || 'Unknown error',
						}),
					},
				],
				isError: true,
			};
		}

		// Success case
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(result.data),
				},
			],
		};
	} catch (error) {
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify({
						error: error instanceof Error ? error.message : 'Unknown error',
					}),
				},
			],
			isError: true,
		};
	}
}
