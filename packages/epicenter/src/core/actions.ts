/**
 * Action System: Lightweight boundary layer for exposing workspace functionality.
 *
 * Actions are plain objects with handlers and metadata for cross-boundary invocation.
 * They enable REST API endpoints, MCP tool definitions, CLI commands, and OpenAPI docs.
 *
 * Actions are defined AFTER client creation and passed to adapters (server, CLI) explicitly.
 * This separates the internal runtime (capabilities) from external boundary contracts (actions).
 *
 * @example
 * ```typescript
 * // Define actions wrapping client methods
 * const actions = {
 *   posts: {
 *     getAll: defineAction({
 *       type: 'query',
 *       handler: () => client.tables.posts.getAllValid(),
 *     }),
 *     create: defineAction({
 *       type: 'mutation',
 *       input: type({ title: 'string' }),
 *       handler: ({ title }) => {
 *         const id = generateId();
 *         client.tables.posts.upsert({ id, title });
 *         return { id };
 *       },
 *     }),
 *   },
 * };
 *
 * // Pass to server/CLI
 * const server = createServer(client, { actions });
 * ```
 */

import type {
	StandardSchemaV1,
	StandardSchemaWithJSONSchema,
} from './schema/standard/types';

/**
 * Action: a plain object with handler and metadata for cross-boundary invocation.
 *
 * Actions enable:
 * - REST API endpoints (GET for queries, POST for mutations)
 * - MCP tool definitions
 * - CLI commands
 * - OpenAPI documentation
 *
 * The handler signature is conditional on whether `input` is defined:
 * - With input: `(input: TInput) => TOutput | Promise<TOutput>`
 * - Without input: `() => TOutput | Promise<TOutput>`
 *
 * @template TInput - Input schema (must support JSON Schema generation)
 * @template TOutput - Handler return type (inferred if not specified)
 *
 * @example No input - handler has no arguments
 * ```typescript
 * const getAllPosts = defineAction({
 *   type: 'query',
 *   handler: () => client.tables.posts.getAllValid(),
 * });
 * ```
 *
 * @example With input - handler receives typed input
 * ```typescript
 * const createPost = defineAction({
 *   type: 'mutation',
 *   input: type({ title: 'string' }),
 *   handler: ({ title }) => {
 *     // TypeScript knows: title is string
 *     client.tables.posts.upsert({ id: generateId(), title });
 *   },
 * });
 * ```
 */
export type Action<
	TInput extends StandardSchemaWithJSONSchema | undefined = undefined,
	TOutput = unknown,
> = {
	/** 'query' for read operations (GET), 'mutation' for write operations (POST) */
	type: 'query' | 'mutation';

	/** Human-readable description for docs and MCP tool descriptions */
	description?: string;

	/** Input schema for validation and JSON Schema generation */
	input?: TInput;

	/** Output schema for documentation (optional, can be inferred) */
	output?: StandardSchemaWithJSONSchema;

	/** The handler function. Receives validated input if `input` is defined. */
	handler: TInput extends StandardSchemaWithJSONSchema
		? (
				input: StandardSchemaV1.InferOutput<TInput>,
			) => TOutput | Promise<TOutput>
		: () => TOutput | Promise<TOutput>;
};

/**
 * Actions can nest to any depth.
 * Leaves must be Action objects (have `type` and `handler`).
 *
 * @example Flat structure
 * ```typescript
 * const actions = {
 *   getUser: defineAction({ type: 'query', handler: ... }),
 *   createUser: defineAction({ type: 'mutation', handler: ... }),
 * };
 * ```
 *
 * @example Nested structure
 * ```typescript
 * const actions = {
 *   users: {
 *     getAll: defineAction({ type: 'query', handler: ... }),
 *     create: defineAction({ type: 'mutation', handler: ... }),
 *   },
 *   posts: {
 *     getAll: defineAction({ type: 'query', handler: ... }),
 *   },
 * };
 * ```
 */
export type Actions = {
	[key: string]: Action<any, any> | Actions;
};

/**
 * Define an action with full type inference.
 *
 * This is an identity function that provides type inference for:
 * - TInput: Inferred from the `input` schema
 * - TOutput: Inferred from the handler return type
 * - Handler signature: Conditional based on whether `input` is defined
 *
 * Without this helper, you'd need `satisfies Action` and lose input type inference.
 *
 * @example No input - handler has no arguments
 * ```typescript
 * const getAllPosts = defineAction({
 *   type: 'query',
 *   handler: () => client.tables.posts.getAllValid(),
 * });
 * ```
 *
 * @example With input - handler receives typed input
 * ```typescript
 * const createPost = defineAction({
 *   type: 'mutation',
 *   input: type({ title: 'string' }),
 *   handler: ({ title }) => {
 *     // TypeScript knows: title is string
 *     client.tables.posts.upsert({ id: generateId(), title });
 *   },
 * });
 * ```
 *
 * @example With description for MCP/docs
 * ```typescript
 * const syncMarkdown = defineAction({
 *   type: 'mutation',
 *   description: 'Sync markdown files to YJS',
 *   handler: () => client.capabilities.markdown.pullFromMarkdown(),
 * });
 * ```
 */
export function defineAction<
	TInput extends StandardSchemaWithJSONSchema | undefined = undefined,
	TOutput = unknown,
>(action: Action<TInput, TOutput>): Action<TInput, TOutput> {
	return action;
}

/**
 * Type guard to check if a value is an Action (either query or mutation).
 *
 * Actions are identified by having both `type` ('query' | 'mutation') and `handler` properties.
 * This distinguishes them from nested action groups (which are plain objects).
 *
 * @example
 * ```typescript
 * function walkActions(node: Action | Actions) {
 *   if (isAction(node)) {
 *     // node is Action
 *     console.log(node.type, node.handler);
 *   } else {
 *     // node is Actions (nested structure)
 *     for (const [key, child] of Object.entries(node)) {
 *       walkActions(child);
 *     }
 *   }
 * }
 * ```
 */
export function isAction(value: unknown): value is Action<any, any> {
	return (
		typeof value === 'object' &&
		value !== null &&
		'type' in value &&
		(value.type === 'query' || value.type === 'mutation') &&
		'handler' in value &&
		typeof value.handler === 'function'
	);
}

/**
 * Type guard to check if a value is a query action.
 *
 * Query actions represent read operations and map to HTTP GET requests.
 *
 * @example
 * ```typescript
 * if (isQuery(action)) {
 *   // Use GET method for this action
 * }
 * ```
 */
export function isQuery(value: unknown): value is Action<any, any> {
	return isAction(value) && value.type === 'query';
}

/**
 * Type guard to check if a value is a mutation action.
 *
 * Mutation actions represent write operations and map to HTTP POST requests.
 *
 * @example
 * ```typescript
 * if (isMutation(action)) {
 *   // Use POST method for this action
 * }
 * ```
 */
export function isMutation(value: unknown): value is Action<any, any> {
	return isAction(value) && value.type === 'mutation';
}

/**
 * Walk an action tree and call a visitor function for each action.
 *
 * The visitor receives:
 * - `action`: The action object
 * - `path`: Array of keys from root to this action (e.g., ['posts', 'create'])
 *
 * @example Generate routes from actions
 * ```typescript
 * walkActions(actions, (action, path) => {
 *   const route = '/' + path.join('/');
 *   const method = action.type === 'query' ? 'GET' : 'POST';
 *   console.log(`${method} ${route}`);
 * });
 * // GET /posts/getAll
 * // POST /posts/create
 * ```
 */
export function walkActions(
	actions: Actions,
	visitor: (action: Action<any, any>, path: string[]) => void,
	path: string[] = [],
): void {
	for (const [key, value] of Object.entries(actions)) {
		const currentPath = [...path, key];
		if (isAction(value)) {
			visitor(value, currentPath);
		} else {
			walkActions(value, visitor, currentPath);
		}
	}
}
