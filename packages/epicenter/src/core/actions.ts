import type { TaggedError } from 'wellcrafted/error';
import type { Result } from 'wellcrafted/result';
import type { StandardSchemaV1, StandardSchemaWithJSONSchema } from './schema';

// =============================================================================
// Actions Map
// =============================================================================

/**
 * The return type of a workspace's actions.
 *
 * Contains only actions (queries/mutations) or nested namespaces of actions.
 * Everything returned is auto-mapped to API endpoints and MCP tools.
 *
 * @example Flat structure
 * ```typescript
 * const actions = {
 *   getUser: defineQuery({ output: ..., handler: ... }),
 *   createUser: defineMutation({ input: ..., output: ..., handler: ... }),
 * };
 * ```
 *
 * @example Namespaced structure
 * ```typescript
 * const actions = {
 *   users: {
 *     getAll: defineQuery({ output: ..., handler: ... }),
 *     create: defineMutation({ input: ..., output: ..., handler: ... }),
 *   },
 * };
 * ```
 */
export type Actions = {
	// biome-ignore lint/suspicious/noExplicitAny: Actions uses `any` for heterogeneous action collections
	[key: string]: Action<any, any, any, any> | Actions;
};

// =============================================================================
// Action Types (Callable Functions with Metadata)
// =============================================================================

/**
 * Action - a callable function with metadata for cross-boundary invocation.
 *
 * Actions are the unit of work in Epicenter. They have JSON-serializable inputs
 * and outputs, enabling transparent message passing across process boundaries
 * (HTTP, WebSocket, IPC). This makes them suitable for:
 * - REST API endpoints
 * - MCP tool definitions
 * - CLI commands
 * - Cross-workspace dependencies
 *
 * Actions are callable directly: `action(input, ctx)` returns the result.
 * They also expose metadata properties (type, input, output, description) for
 * introspection and documentation generation.
 *
 * @example
 * ```typescript
 * const getUser = defineQuery({
 *   input: type({ id: 'string' }),
 *   output: type({ id: 'string', name: 'string' }),
 *   handler: ({ id }, ctx) => ctx.tables.users.get({ id }),
 * });
 *
 * // Call directly (when bound to context)
 * const user = await getUser({ id: '123' });
 *
 * // Access metadata
 * getUser.type        // 'query'
 * getUser.input       // StandardSchema
 * getUser.output      // StandardSchema
 * getUser.description // string | undefined
 * ```
 */
export type Action<
	TOutput = unknown,
	TError extends TaggedError | never = TaggedError,
	TInput extends StandardSchemaWithJSONSchema | undefined =
		| StandardSchemaWithJSONSchema
		| undefined,
	TAsync extends boolean = boolean,
> =
	| Query<TOutput, TError, TInput, TAsync>
	| Mutation<TOutput, TError, TInput, TAsync>;

/**
 * Query action: read operation with no side effects.
 *
 * Callable directly - returns TOutput or Result<TOutput, TError> depending on handler.
 * Sync handlers return values directly; async handlers return Promises.
 */
export type Query<
	TOutput = unknown,
	TError extends TaggedError<string> | never = never,
	TInput extends StandardSchemaWithJSONSchema | undefined =
		| StandardSchemaWithJSONSchema
		| undefined,
	TAsync extends boolean = boolean,
> = {
	(
		...args: TInput extends StandardSchemaWithJSONSchema
			? [input: StandardSchemaV1.InferOutput<TInput>]
			: []
	): TAsync extends true
		? [TError] extends [never]
			? Promise<TOutput>
			: Promise<Result<TOutput, TError>>
		: [TError] extends [never]
			? TOutput
			: Result<TOutput, TError>;

	type: 'query';
	input?: TInput;
	output: StandardSchemaWithJSONSchema;
	description?: string;
};

/**
 * Mutation action: write operation that modifies state.
 *
 * Callable directly - returns TOutput or Result<TOutput, TError> depending on handler.
 * Sync handlers return values directly; async handlers return Promises.
 */
export type Mutation<
	TOutput = unknown,
	TError extends TaggedError<string> | never = never,
	TInput extends StandardSchemaWithJSONSchema | undefined =
		| StandardSchemaWithJSONSchema
		| undefined,
	TAsync extends boolean = boolean,
> = {
	(
		...args: TInput extends StandardSchemaWithJSONSchema
			? [input: StandardSchemaV1.InferOutput<TInput>]
			: []
	): TAsync extends true
		? [TError] extends [never]
			? Promise<TOutput>
			: Promise<Result<TOutput, TError>>
		: [TError] extends [never]
			? TOutput
			: Result<TOutput, TError>;

	type: 'mutation';
	input?: TInput;
	output: StandardSchemaWithJSONSchema;
	description?: string;
};

// =============================================================================
// Handler Context (passed to handlers as 2nd argument)
// =============================================================================

/**
 * Context passed to action handlers as the 2nd argument.
 *
 * Provides typed access to workspace resources. Types are fully inferred
 * when actions are bound to a workspace via `.withActions()`.
 */
export type HandlerContext<
	TTables = unknown,
	TKv = unknown,
	TProviders = unknown,
	TPaths = unknown,
> = {
	tables: TTables;
	kv: TKv;
	providers: TProviders;
	paths: TPaths;
};

// =============================================================================
// defineQuery - 8 Overloads
// =============================================================================

/**
 * Define a query action (read operation with no side effects).
 *
 * Queries are used for read operations that don't modify state. They map to
 * HTTP GET endpoints when exposed via the server.
 *
 * **Overload 1/8**: With input, returns Result<TOutput, TError>, sync
 *
 * ## Input Schema Constraints
 *
 * Input schemas are converted to JSON Schema for MCP/CLI/OpenAPI. Avoid:
 * - **Transforms**: `.pipe()` (ArkType), `.transform()` (Zod)
 * - **Custom validation**: `.filter()` (ArkType), `.refine()` (Zod)
 * - **Non-JSON types**: `bigint`, `symbol`, `undefined`, `Date`, `Map`, `Set`
 *
 * Use basic types and `.matching(regex)` for patterns. For complex validation,
 * validate in the handler instead.
 *
 * @example
 * ```typescript
 * const getUser = defineQuery({
 *   input: type({ id: 'string' }),
 *   output: type({ id: 'string', name: 'string', 'email?': 'string' }),
 *   handler: ({ id }, ctx) => {
 *     const result = ctx.tables.users.get({ id });
 *     if (result.status !== 'valid') {
 *       return Err(NotFoundErr({ message: `User ${id} not found` }));
 *     }
 *     return Ok(result.row);
 *   },
 * });
 * ```
 */
export function defineQuery<
	TOutput,
	TError extends TaggedError<string>,
	TInput extends StandardSchemaWithJSONSchema,
	TOutputSchema extends StandardSchemaWithJSONSchema,
>(config: {
	input: TInput;
	output: TOutputSchema;
	handler: (
		input: StandardSchemaV1.InferOutput<NoInfer<TInput>>,
		ctx: HandlerContext,
	) => Result<TOutput, TError>;
	description?: string;
}): Query<TOutput, TError, TInput, false>;

/**
 * Overload 2/8: With input, returns Result<TOutput, TError>, async
 */
export function defineQuery<
	TOutput,
	TError extends TaggedError<string>,
	TInput extends StandardSchemaWithJSONSchema,
	TOutputSchema extends StandardSchemaWithJSONSchema,
>(config: {
	input: TInput;
	output: TOutputSchema;
	handler: (
		input: StandardSchemaV1.InferOutput<NoInfer<TInput>>,
		ctx: HandlerContext,
	) => Promise<Result<TOutput, TError>>;
	description?: string;
}): Query<TOutput, TError, TInput, true>;

/**
 * Overload 3/8: With input, returns TOutput (can't fail), sync
 */
export function defineQuery<
	TOutput,
	TInput extends StandardSchemaWithJSONSchema,
	TOutputSchema extends StandardSchemaWithJSONSchema,
>(config: {
	input: TInput;
	output: TOutputSchema;
	handler: (
		input: StandardSchemaV1.InferOutput<NoInfer<TInput>>,
		ctx: HandlerContext,
	) => TOutput;
	description?: string;
}): Query<TOutput, never, TInput, false>;

/**
 * Overload 4/8: With input, returns Promise<TOutput> (can't fail), async
 */
export function defineQuery<
	TOutput,
	TInput extends StandardSchemaWithJSONSchema,
	TOutputSchema extends StandardSchemaWithJSONSchema,
>(config: {
	input: TInput;
	output: TOutputSchema;
	handler: (
		input: StandardSchemaV1.InferOutput<NoInfer<TInput>>,
		ctx: HandlerContext,
	) => Promise<TOutput>;
	description?: string;
}): Query<TOutput, never, TInput, true>;

/**
 * Overload 5/8: No input, returns Result<TOutput, TError>, sync
 */
export function defineQuery<
	TOutput,
	TError extends TaggedError<string>,
	TOutputSchema extends StandardSchemaWithJSONSchema,
>(config: {
	output: TOutputSchema;
	handler: (ctx: HandlerContext) => Result<TOutput, TError>;
	description?: string;
}): Query<TOutput, TError, undefined, false>;

/**
 * Overload 6/8: No input, returns Result<TOutput, TError>, async
 */
export function defineQuery<
	TOutput,
	TError extends TaggedError<string>,
	TOutputSchema extends StandardSchemaWithJSONSchema,
>(config: {
	output: TOutputSchema;
	handler: (ctx: HandlerContext) => Promise<Result<TOutput, TError>>;
	description?: string;
}): Query<TOutput, TError, undefined, true>;

/**
 * Overload 7/8: No input, returns TOutput (can't fail), sync
 */
export function defineQuery<
	TOutput,
	TOutputSchema extends StandardSchemaWithJSONSchema,
>(config: {
	output: TOutputSchema;
	handler: (ctx: HandlerContext) => TOutput;
	description?: string;
}): Query<TOutput, never, undefined, false>;

/**
 * Overload 8/8: No input, returns Promise<TOutput> (can't fail), async
 */
export function defineQuery<
	TOutput,
	TOutputSchema extends StandardSchemaWithJSONSchema,
>(config: {
	output: TOutputSchema;
	handler: (ctx: HandlerContext) => Promise<TOutput>;
	description?: string;
}): Query<TOutput, never, undefined, true>;

// biome-ignore lint/suspicious/noExplicitAny: Implementation signature must accept all overload combinations
export function defineQuery(config: ActionConfig): any {
	const hasInput = 'input' in config && config.input !== undefined;

	return Object.assign(
		hasInput
			? // biome-ignore lint/suspicious/noExplicitAny: Handler invocation requires any for flexibility
				(input: unknown, ctx: HandlerContext) =>
					(config.handler as any)(input, ctx)
			: // biome-ignore lint/suspicious/noExplicitAny: Handler invocation requires any for flexibility
				(ctx: HandlerContext) => (config.handler as any)(ctx),
		{
			type: 'query' as const,
			input: config.input,
			output: config.output,
			description: config.description,
		},
	);
}

// =============================================================================
// defineMutation - 8 Overloads
// =============================================================================

/**
 * Define a mutation action (write operation that modifies state).
 *
 * Mutations are used for operations that create, update, or delete data.
 * They map to HTTP POST endpoints when exposed via the server.
 *
 * **Overload 1/8**: With input, returns Result<TOutput, TError>, sync
 *
 * ## Input Schema Constraints
 *
 * Input schemas are converted to JSON Schema for MCP/CLI/OpenAPI. Avoid:
 * - **Transforms**: `.pipe()` (ArkType), `.transform()` (Zod)
 * - **Custom validation**: `.filter()` (ArkType), `.refine()` (Zod)
 * - **Non-JSON types**: `bigint`, `symbol`, `undefined`, `Date`, `Map`, `Set`
 *
 * Use basic types and `.matching(regex)` for patterns. For complex validation,
 * validate in the handler instead.
 *
 * @example
 * ```typescript
 * const createUser = defineMutation({
 *   input: type({ name: 'string', email: 'string' }),
 *   output: type({ id: 'string' }),
 *   handler: ({ name, email }, ctx) => {
 *     const id = generateId();
 *     ctx.tables.users.upsert({ id, name, email });
 *     return Ok({ id });
 *   },
 * });
 * ```
 */
export function defineMutation<
	TOutput,
	TError extends TaggedError<string>,
	TInput extends StandardSchemaWithJSONSchema,
	TOutputSchema extends StandardSchemaWithJSONSchema,
>(config: {
	input: TInput;
	output: TOutputSchema;
	handler: (
		input: StandardSchemaV1.InferOutput<NoInfer<TInput>>,
		ctx: HandlerContext,
	) => Result<TOutput, TError>;
	description?: string;
}): Mutation<TOutput, TError, TInput, false>;

/**
 * Overload 2/8: With input, returns Result<TOutput, TError>, async
 */
export function defineMutation<
	TOutput,
	TError extends TaggedError<string>,
	TInput extends StandardSchemaWithJSONSchema,
	TOutputSchema extends StandardSchemaWithJSONSchema,
>(config: {
	input: TInput;
	output: TOutputSchema;
	handler: (
		input: StandardSchemaV1.InferOutput<NoInfer<TInput>>,
		ctx: HandlerContext,
	) => Promise<Result<TOutput, TError>>;
	description?: string;
}): Mutation<TOutput, TError, TInput, true>;

/**
 * Overload 3/8: With input, returns TOutput (can't fail), sync
 */
export function defineMutation<
	TOutput,
	TInput extends StandardSchemaWithJSONSchema,
	TOutputSchema extends StandardSchemaWithJSONSchema,
>(config: {
	input: TInput;
	output: TOutputSchema;
	handler: (
		input: StandardSchemaV1.InferOutput<NoInfer<TInput>>,
		ctx: HandlerContext,
	) => TOutput;
	description?: string;
}): Mutation<TOutput, never, TInput, false>;

/**
 * Overload 4/8: With input, returns Promise<TOutput> (can't fail), async
 */
export function defineMutation<
	TOutput,
	TInput extends StandardSchemaWithJSONSchema,
	TOutputSchema extends StandardSchemaWithJSONSchema,
>(config: {
	input: TInput;
	output: TOutputSchema;
	handler: (
		input: StandardSchemaV1.InferOutput<NoInfer<TInput>>,
		ctx: HandlerContext,
	) => Promise<TOutput>;
	description?: string;
}): Mutation<TOutput, never, TInput, true>;

/**
 * Overload 5/8: No input, returns Result<TOutput, TError>, sync
 */
export function defineMutation<
	TOutput,
	TError extends TaggedError<string>,
	TOutputSchema extends StandardSchemaWithJSONSchema,
>(config: {
	output: TOutputSchema;
	handler: (ctx: HandlerContext) => Result<TOutput, TError>;
	description?: string;
}): Mutation<TOutput, TError, undefined, false>;

/**
 * Overload 6/8: No input, returns Result<TOutput, TError>, async
 */
export function defineMutation<
	TOutput,
	TError extends TaggedError<string>,
	TOutputSchema extends StandardSchemaWithJSONSchema,
>(config: {
	output: TOutputSchema;
	handler: (ctx: HandlerContext) => Promise<Result<TOutput, TError>>;
	description?: string;
}): Mutation<TOutput, TError, undefined, true>;

/**
 * Overload 7/8: No input, returns TOutput (can't fail), sync
 */
export function defineMutation<
	TOutput,
	TOutputSchema extends StandardSchemaWithJSONSchema,
>(config: {
	output: TOutputSchema;
	handler: (ctx: HandlerContext) => TOutput;
	description?: string;
}): Mutation<TOutput, never, undefined, false>;

/**
 * Overload 8/8: No input, returns Promise<TOutput> (can't fail), async
 */
export function defineMutation<
	TOutput,
	TOutputSchema extends StandardSchemaWithJSONSchema,
>(config: {
	output: TOutputSchema;
	handler: (ctx: HandlerContext) => Promise<TOutput>;
	description?: string;
}): Mutation<TOutput, never, undefined, true>;

// biome-ignore lint/suspicious/noExplicitAny: Implementation signature must accept all overload combinations
export function defineMutation(config: ActionConfig): any {
	const hasInput = 'input' in config && config.input !== undefined;

	return Object.assign(
		hasInput
			? // biome-ignore lint/suspicious/noExplicitAny: Handler invocation requires any for flexibility
				(input: unknown, ctx: HandlerContext) =>
					(config.handler as any)(input, ctx)
			: // biome-ignore lint/suspicious/noExplicitAny: Handler invocation requires any for flexibility
				(ctx: HandlerContext) => (config.handler as any)(ctx),
		{
			type: 'mutation' as const,
			input: config.input,
			output: config.output,
			description: config.description,
		},
	);
}

// =============================================================================
// ActionConfig (internal)
// =============================================================================

type ActionConfig = {
	input?: StandardSchemaWithJSONSchema;
	output: StandardSchemaWithJSONSchema;
	// biome-ignore lint/suspicious/noExplicitAny: Handler signature varies across overloads
	handler: (...args: any[]) => any;
	description?: string;
};

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard: Check if a value is an Action (Query or Mutation).
 *
 * Actions are callable functions with a `type` property of 'query' or 'mutation'.
 * Use this to distinguish actions from namespaces when walking through an actions map.
 *
 * @example
 * ```typescript
 * const getUser = defineQuery({ output: ..., handler: ... });
 * const createUser = defineMutation({ output: ..., handler: ... });
 *
 * isAction(getUser)       // true
 * isAction(createUser)    // true
 * isAction({ foo: 'bar' }) // false
 * ```
 */
export function isAction(value: unknown): value is Action {
	return (
		typeof value === 'function' &&
		'type' in value &&
		(value.type === 'query' || value.type === 'mutation')
	);
}

/**
 * Type guard: Check if a value is a Query action.
 *
 * @example
 * ```typescript
 * const getUser = defineQuery({ output: ..., handler: ... });
 * const createUser = defineMutation({ output: ..., handler: ... });
 *
 * isQuery(getUser)    // true
 * isQuery(createUser) // false
 * ```
 */
export function isQuery(value: unknown): value is Query {
	return isAction(value) && value.type === 'query';
}

/**
 * Type guard: Check if a value is a Mutation action.
 *
 * @example
 * ```typescript
 * const getUser = defineQuery({ output: ..., handler: ... });
 * const createUser = defineMutation({ output: ..., handler: ... });
 *
 * isMutation(getUser)    // false
 * isMutation(createUser) // true
 * ```
 */
export function isMutation(value: unknown): value is Mutation {
	return isAction(value) && value.type === 'mutation';
}

/**
 * Type guard: Check if a value is a namespace (plain object that might contain actions).
 *
 * A namespace is any plain object that is not an action itself.
 * This allows recursive walking through nested action structures.
 *
 * @example
 * ```typescript
 * const actions = {
 *   getUser: defineQuery({ ... }),
 *   users: { getAll: defineQuery({ ... }) }
 * };
 *
 * isNamespace(actions.getUser) // false (it's an action)
 * isNamespace(actions.users)   // true (it's a namespace containing actions)
 * isNamespace([1, 2, 3])       // false (arrays are not namespaces)
 * isNamespace("hello")         // false (primitives are not namespaces)
 * ```
 */
export function isNamespace(value: unknown): value is Record<string, unknown> {
	return (
		typeof value === 'object' &&
		value !== null &&
		!Array.isArray(value) &&
		!isAction(value)
	);
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Recursively walk through actions and yield each action with its path.
 *
 * This generator function traverses a nested action structure and yields
 * each action along with its path from the root. The path is an array of
 * keys that identifies the action's location in the hierarchy.
 *
 * Useful for:
 * - Generating CLI commands from actions
 * - Registering HTTP routes for each action
 * - Building documentation from action metadata
 *
 * @param actions - The workspace actions object to walk through
 * @param path - Current path array (used internally for recursion)
 * @yields Objects containing the action path and the action itself
 *
 * @example
 * ```typescript
 * const actions = {
 *   users: {
 *     getAll: defineQuery({ ... }),
 *     crud: {
 *       create: defineMutation({ ... })
 *     }
 *   },
 *   health: defineQuery({ ... })
 * };
 *
 * for (const { path, action } of walkActions(actions)) {
 *   console.log(path.join('/'), action.type);
 *   // Output:
 *   // users/getAll query
 *   // users/crud/create mutation
 *   // health query
 * }
 * ```
 */
export function* walkActions(
	actions: unknown,
	path: string[] = [],
): Generator<{ path: string[]; action: Action }> {
	if (!actions || typeof actions !== 'object') return;

	for (const [key, value] of Object.entries(actions)) {
		if (isAction(value)) {
			yield { path: [...path, key], action: value };
		} else if (isNamespace(value)) {
			yield* walkActions(value, [...path, key]);
		}
	}
}

/**
 * Helper to define workspace actions with full type inference.
 *
 * Identity function that provides type safety and better IDE support
 * when defining workspace actions. Particularly useful when defining
 * actions outside of a workspace definition.
 *
 * @example
 * ```typescript
 * const actions = defineActions({
 *   getUser: defineQuery({ output: ..., handler: ... }),
 *   createUser: defineMutation({ input: ..., output: ..., handler: ... }),
 * });
 *
 * // Type is fully inferred:
 * // {
 * //   getUser: Query<...>,
 * //   createUser: Mutation<...>,
 * // }
 * ```
 */
export function defineActions<T extends Actions>(actions: T): T {
	return actions;
}

// =============================================================================
// Type Inference Utilities
// =============================================================================

/**
 * Infer the input type from an action.
 *
 * Returns `undefined` if the action has no input schema.
 *
 * @example
 * ```typescript
 * const createUser = defineMutation({
 *   input: type({ name: 'string', email: 'string' }),
 *   output: type({ id: 'string' }),
 *   handler: ...
 * });
 *
 * type Input = InferActionInput<typeof createUser>;
 * // { name: string; email: string }
 * ```
 */
export type InferActionInput<T extends Action> =
	T extends Action<any, any, infer TInput, any>
		? TInput extends StandardSchemaWithJSONSchema
			? StandardSchemaV1.InferOutput<TInput>
			: undefined
		: never;

/**
 * Infer the output type from an action.
 *
 * @example
 * ```typescript
 * const getUser = defineQuery({
 *   input: type({ id: 'string' }),
 *   output: type({ id: 'string', name: 'string' }),
 *   handler: ...
 * });
 *
 * type Output = InferActionOutput<typeof getUser>;
 * // { id: string; name: string }
 * ```
 */
export type InferActionOutput<T extends Action> =
	T extends Action<infer TOutput, any, any, any> ? TOutput : never;
