import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import {
	CallToolRequestSchema,
	type CallToolResult,
	ErrorCode,
	ListToolsRequestSchema,
	McpError,
} from '@modelcontextprotocol/sdk/types.js';
import type { JSONSchema7 } from 'json-schema';
import type { TaggedError } from 'wellcrafted/error';
import { isResult, type Result } from 'wellcrafted/result';
import type { Action } from '../core/actions';
import {
	type ActionInfo,
	type EpicenterClient,
	type EpicenterConfig,
	iterActions,
} from '../core/epicenter';
import { safeToJsonSchema } from '../core/schema/safe-json-schema';
import type { AnyWorkspaceConfig } from '../core/workspace';

/**
 * Pre-computed MCP tool entry with action and its JSON Schema.
 * Schema is computed once during registry build and reused for ListTools.
 */
type McpToolEntry = {
	action: Action;
	/** Pre-computed JSON Schema for the action's input (guaranteed to be object type) */
	inputSchema: JSONSchema7;
};

/** Default schema for actions without input: empty object */
const EMPTY_OBJECT_SCHEMA: JSONSchema7 = { type: 'object', properties: {} };

/**
 * Create and configure an MCP server with tool handlers.
 *
 * This creates a protocol-level MCP server that can be connected to any transport
 * (HTTP, stdio, etc.). The server exposes all workspace actions as MCP tools using
 * a flat namespace (e.g., `workspace_action`).
 *
 * @param client - The hierarchical EpicenterClient with workspace namespaces
 * @param config - Epicenter configuration containing server ID and workspaces
 * @returns Configured MCP server instance ready to connect to a transport
 *
 * @see {@link createServer} for how the MCP server is registered on `/mcp` in the Hono web server.
 */
export async function createMcpServer<
	TId extends string,
	TWorkspaces extends readonly AnyWorkspaceConfig[],
>(
	client: EpicenterClient<TWorkspaces>,
	config: EpicenterConfig<TId, TWorkspaces>,
): Promise<McpServer> {
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
		},
	);

	const toolRegistry = await buildMcpToolRegistry(client);

	// List tools handler - uses pre-computed schemas from registry
	mcpServer.setRequestHandler(ListToolsRequestSchema, () => {
		const tools = Array.from(toolRegistry.entries()).map(
			([name, { action, inputSchema }]) => ({
				name,
				title: name,
				description: action.description ?? `Execute ${name}`,
				inputSchema,
			}),
		);
		return { tools };
	});

	// Call tool handler
	mcpServer.setRequestHandler(
		CallToolRequestSchema,
		async (request): Promise<CallToolResult> => {
			const entry = toolRegistry.get(request.params.name);

			if (!entry) {
				throw new McpError(
					ErrorCode.InvalidParams,
					`Unknown tool: ${request.params.name}`,
				);
			}

			const { action } = entry;

			const args = request.params.arguments || {};

			// Validate input with Standard Schema
			let validatedInput: unknown;
			if (action.input) {
				let result = action.input['~standard'].validate(args);
				if (result instanceof Promise) result = await result;
				if (result.issues) {
					throw new McpError(
						ErrorCode.InvalidParams,
						`Invalid input for ${request.params.name}: ${JSON.stringify(
							result.issues.map((issue) => ({
								path: issue.path
									? issue.path
											.map((s) => (typeof s === 'object' ? s.key : s))
											.join('.')
									: 'root',
								message: issue.message,
							})),
						)}`,
					);
				}
				validatedInput = result.value;
			}

			// Execute action
			const maybeResult = (await action(validatedInput)) as
				| Result<unknown, TaggedError>
				| unknown;

			// Extract the actual output data and check for errors
			const outputChannel = isResult(maybeResult)
				? maybeResult.data
				: maybeResult;
			const errorChannel = isResult(maybeResult)
				? (maybeResult.error as TaggedError)
				: undefined;

			// Validate output schema if present (only validate when we have data)
			if (action.output && outputChannel !== undefined) {
				let result = action.output['~standard'].validate(outputChannel);
				if (result instanceof Promise) result = await result;
				if (result.issues) {
					throw new McpError(
						ErrorCode.InternalError,
						`Output validation failed for ${request.params.name}: ${JSON.stringify(
							result.issues.map((issue) => ({
								path: issue.path
									? issue.path
											.map((s) => (typeof s === 'object' ? s.key : s))
											.join('.')
									: 'root',
								message: issue.message,
							})),
						)}`,
					);
				}
			}

			// Handle error case
			if (errorChannel) {
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								error: errorChannel.message ?? 'Unknown error',
							}),
						},
					],
					isError: true,
				} satisfies CallToolResult;
			}

			// Handle void/undefined returns (successful operations with no data)
			if (outputChannel === undefined || outputChannel === null) {
				return {
					content: [],
				} satisfies CallToolResult;
			}

			// MCP protocol requires structuredContent to be an object, not an array
			// Wrap arrays in an object with a semantic key derived from the action name
			const structuredContent = (
				Array.isArray(outputChannel)
					? { [deriveCollectionKey(request.params.name)]: outputChannel }
					: outputChannel
			) as Record<string, unknown>;

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify(outputChannel),
					},
				],
				structuredContent,
			} satisfies CallToolResult;
		},
	);

	return mcpServer;
}

/**
 * Build a registry of MCP-compatible tools from workspace actions.
 *
 * This function:
 * 1. Flattens hierarchical workspace actions into MCP tool names (underscore-joined)
 * 2. Pre-computes JSON Schemas for each action's input (parallelized)
 * 3. Filters out actions with non-object inputs (MCP requires object type)
 * 4. Returns a registry that can be used for both ListTools and CallTool handlers
 *
 * Actions with non-object input schemas are filtered out with a warning, since MCP
 * requires all tool inputSchema to have `type: "object"` at the root. These actions
 * will still work via HTTP and TypeScript clients.
 *
 * @example
 * // Flat export: { getAll: defineQuery(...) }
 * // → MCP tool name: "workspace_getAll"
 *
 * // Nested export: { users: { crud: { create: defineMutation(...) } } }
 * // → MCP tool name: "workspace_users_crud_create"
 */
async function buildMcpToolRegistry<
	TWorkspaces extends readonly AnyWorkspaceConfig[],
>(client: EpicenterClient<TWorkspaces>): Promise<Map<string, McpToolEntry>> {
	// 1. Collect all actions using the iterator
	const actions = [...iterActions(client)];

	// 2. Transform: build entries in parallel (returns undefined for invalid schemas)
	const entries = await Promise.all(actions.map(buildToolEntry));

	// 3. Filter & Construct: remove undefined entries and build the Map
	return new Map(entries.filter((e) => e !== undefined));
}

/**
 * Build a single tool entry from action info.
 * Returns a [toolName, entry] tuple, or undefined if the action is not MCP-compatible.
 */
async function buildToolEntry(
	info: ActionInfo,
): Promise<[string, McpToolEntry] | undefined> {
	const toolName = [info.workspaceId, ...info.actionPath].join('_');
	const inputSchema = await buildMcpInputSchema(info.action, toolName);

	if (!inputSchema) return undefined;

	return [toolName, { action: info.action, inputSchema }];
}

/**
 * Build the JSON Schema for an action's input.
 * Returns undefined if the schema is not MCP-compatible (non-object type).
 */
async function buildMcpInputSchema(
	action: Action,
	toolName: string,
): Promise<JSONSchema7 | undefined> {
	if (!action.input) return EMPTY_OBJECT_SCHEMA;

	const schema = await safeToJsonSchema(action.input);

	// MCP requires object type at root
	const isValidMcpSchema =
		schema.type === 'object' || schema.type === undefined;
	if (!isValidMcpSchema) {
		console.warn(
			`[MCP] Skipping tool "${toolName}": input has type "${schema.type}" but MCP requires "object". ` +
				`This action will still work via HTTP and TypeScript clients. ` +
				`To enable MCP, wrap your input in an object (e.g., { rows: T[] } instead of T[]).`,
		);
		return undefined;
	}

	return schema;
}

/**
 * Derives a semantic collection key from an MCP tool name for wrapping array responses.
 *
 * MCP protocol requires `structuredContent` to be an object, not an array. When an action
 * returns an array, we wrap it in an object with a semantically meaningful key derived from
 * the action name using deterministic transformation rules.
 *
 * @param mcpToolName - The full MCP tool name in format `${workspaceId}_${actionName}`
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
