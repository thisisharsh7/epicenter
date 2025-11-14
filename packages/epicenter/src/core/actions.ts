import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { TaggedError } from 'wellcrafted/error';
import type { Result } from 'wellcrafted/result';

/**
 * Workspace exports - can include actions and any other utilities
 *
 * Similar to IndexExports, workspaces can export anything.
 * Actions (Query/Mutation) get special treatment:
 * - Auto-mapped to API endpoints
 * - Auto-mapped to MCP tools
 *
 * Everything else is accessible via client.workspaces.{name}.{export}
 *
 * @example Creating a workspace with mixed exports
 * ```typescript
 * const workspace = defineWorkspace({
 *   actions: () => ({
 *     // Actions - these get auto-mapped to API/MCP
 *     getUser: defineQuery({
 *       handler: async () => { ... }
 *     }),
 *
 *     createUser: defineMutation({
 *       input: userSchema,
 *       handler: async (input) => { ... }
 *     }),
 *
 *     // Utilities - accessible but not auto-mapped
 *     validateEmail: (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
 *
 *     // Constants
 *     constants: {
 *       MAX_USERS: 1000,
 *       DEFAULT_ROLE: 'user'
 *     },
 *
 *     // Helpers
 *     formatters: {
 *       formatUserName: (user) => `${user.firstName} ${user.lastName}`
 *     }
 *   })
 * });
 *
 * // API/MCP mapper usage
 * const actions = extractActions(workspaceExports);
 * // actions = { getUser, createUser } only
 *
 * // Client usage
 * client.workspaces.users.getUser() // Action
 * client.workspaces.users.validateEmail("test@test.com") // Utility
 * client.workspaces.users.constants.MAX_USERS // Constant
 * ```
 */
export type WorkspaceExports = Record<string, unknown>;

/**
 * A collection of workspace actions indexed by action name.
 *
 * This is a subset of WorkspaceExports containing only the actions (queries and mutations).
 * Use extractActions() to filter WorkspaceExports down to just the actions.
 *
 * Each workspace exposes its functionality through a set of typed actions
 * that can be called by other workspaces or external consumers via API/MCP.
 */
// biome-ignore lint/suspicious/noExplicitAny: WorkspaceActionMap is a dynamic collection where each action can have different output and error types. Using `any` here allows flexibility for heterogeneous action collections without forcing users to define complex union types upfront.
export type WorkspaceActionMap = Record<string, Action<any, any>>;

/**
 * Action type - callable function with metadata properties
 * Can be either a query or mutation
 */
export type Action<
	TOutput = unknown,
	TError extends TaggedError | never = TaggedError,
	TInput extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
	TAsync extends boolean = boolean,
> =
	| Query<TOutput, TError, TInput, TAsync>
	| Mutation<TOutput, TError, TInput, TAsync>;

/**
 * Query action: read operation with no side effects
 *
 * Returns TOutput directly when TError is never (handler can't fail)
 * Returns Result<TOutput, TError> when handler can fail
 */
export type Query<
	TOutput = unknown,
	TError extends TaggedError<string> | never = never,
	TInput extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
	TAsync extends boolean = boolean,
> = {
	/**
	 * Call the query action with validated input
	 *
	 * Return type depends on TError:
	 * - TError = never: Returns TOutput directly (handler can't fail)
	 * - TError = SomeError: Returns Result<TOutput, TError> (handler can fail)
	 */
	(
		...args: TInput extends StandardSchemaV1
			? [input: StandardSchemaV1.InferOutput<TInput>]
			: []
	): // Level 1: Async or Sync?
	TAsync extends true
		? // Level 2 (async): Can handler fail?
			[TError] extends [never]
			? Promise<TOutput> // Handler can't fail, returns raw value
			: Promise<Result<TOutput, TError>> // Handler can fail, returns Result
		: // Level 2 (sync): Can handler fail?
			[TError] extends [never]
			? TOutput // Handler can't fail, returns raw value
			: Result<TOutput, TError>; // Handler can fail, returns Result

	// Metadata properties
	type: 'query';
	input?: TInput;
	description?: string;
};

/**
 * Mutation action: write operation that modifies state
 *
 * Returns TOutput directly when TError is never (handler can't fail)
 * Returns Result<TOutput, TError> when handler can fail
 */
export type Mutation<
	TOutput = unknown,
	TError extends TaggedError<string> | never = never,
	TInput extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
	TAsync extends boolean = boolean,
> = {
	/**
	 * Call the mutation action with validated input
	 *
	 * Return type depends on TError:
	 * - TError = never: Returns TOutput directly (handler can't fail)
	 * - TError = SomeError: Returns Result<TOutput, TError> (handler can fail)
	 */
	(
		...args: TInput extends StandardSchemaV1
			? [input: StandardSchemaV1.InferOutput<TInput>]
			: []
	): // Level 1: Async or Sync?
	TAsync extends true
		? // Level 2 (async): Can handler fail?
			[TError] extends [never]
			? Promise<TOutput> // Handler can't fail, returns raw value
			: Promise<Result<TOutput, TError>> // Handler can fail, returns Result
		: // Level 2 (sync): Can handler fail?
			[TError] extends [never]
			? TOutput // Handler can't fail, returns raw value
			: Result<TOutput, TError>; // Handler can fail, returns Result

	// Metadata properties
	type: 'mutation';
	input?: TInput;
	description?: string;
};

/**
 * defineQuery overloads - 8 combinations:
 *
 * 1. With input, returns Result<TOutput, TError>, sync
 * 2. With input, returns Result<TOutput, TError>, async
 * 3. With input, returns TOutput (can't fail), sync
 * 4. With input, returns Promise<TOutput> (can't fail), async
 * 5. No input, returns Result<TOutput, TError>, sync
 * 6. No input, returns Result<TOutput, TError>, async
 * 7. No input, returns TOutput (can't fail), sync
 * 8. No input, returns Promise<TOutput> (can't fail), async
 */

/** 1. With input, returns Result, sync */
export function defineQuery<
	TOutput,
	TError extends TaggedError<string>,
	TInput extends StandardSchemaV1,
>(config: {
	input: TInput;
	handler: (
		input: StandardSchemaV1.InferOutput<NoInfer<TInput>>,
	) => Result<TOutput, TError>;
	description?: string;
}): Query<TOutput, TError, TInput, false>;

/** 2. With input, returns Result, async */
export function defineQuery<
	TOutput,
	TError extends TaggedError<string>,
	TInput extends StandardSchemaV1,
>(config: {
	input: TInput;
	handler: (
		input: StandardSchemaV1.InferOutput<NoInfer<TInput>>,
	) => Promise<Result<TOutput, TError>>;
	description?: string;
}): Query<TOutput, TError, TInput, true>;

/** 3. With input, returns TOutput (can't fail), sync */
export function defineQuery<TOutput, TInput extends StandardSchemaV1>(config: {
	input: TInput;
	handler: (
		input: StandardSchemaV1.InferOutput<NoInfer<TInput>>,
	) => TOutput;
	description?: string;
}): Query<TOutput, never, TInput, false>;

/** 4. With input, returns Promise<TOutput> (can't fail), async */
export function defineQuery<TOutput, TInput extends StandardSchemaV1>(config: {
	input: TInput;
	handler: (
		input: StandardSchemaV1.InferOutput<NoInfer<TInput>>,
	) => Promise<TOutput>;
	description?: string;
}): Query<TOutput, never, TInput, true>;

/** 5. No input, returns Result, sync */
export function defineQuery<
	TOutput,
	TError extends TaggedError<string>,
>(config: {
	handler: () => Result<TOutput, TError>;
	description?: string;
}): Query<TOutput, TError, undefined, false>;

/** 6. No input, returns Result, async */
export function defineQuery<
	TOutput,
	TError extends TaggedError<string>,
>(config: {
	handler: () => Promise<Result<TOutput, TError>>;
	description?: string;
}): Query<TOutput, TError, undefined, true>;

/** 7. No input, returns TOutput (can't fail), sync */
export function defineQuery<TOutput>(config: {
	handler: () => TOutput;
	description?: string;
}): Query<TOutput, never, undefined, false>;

/** 8. No input, returns Promise<TOutput> (can't fail), async */
export function defineQuery<TOutput>(config: {
	handler: () => Promise<TOutput>;
	description?: string;
}): Query<TOutput, never, undefined, true>;

/**
 * Implementation for defineQuery
 *
 * Creates a Query action that passes through handler results directly.
 *
 * Handlers can return either raw values (T) or Result types (Result<T, E>).
 * The return value is passed through as-is with no wrapping.
 *
 * Input validation should be handled by external middleware (e.g., Hono's validator)
 * or manual validation when needed (e.g., in MCP server).
 */
// biome-ignore lint/suspicious/noExplicitAny: Implementation must be general to support all overload combinations. Type safety is enforced through the overload signatures above.
export function defineQuery(config: ActionConfig): any {
	return Object.assign((input: unknown) => (config.handler as any)(input), {
		type: 'query' as const,
		input: config.input,
		description: config.description,
	});
}

/**
 * defineMutation overloads - 8 combinations:
 *
 * 1. With input, returns Result<TOutput, TError>, sync
 * 2. With input, returns Result<TOutput, TError>, async
 * 3. With input, returns TOutput (can't fail), sync
 * 4. With input, returns Promise<TOutput> (can't fail), async
 * 5. No input, returns Result<TOutput, TError>, sync
 * 6. No input, returns Result<TOutput, TError>, async
 * 7. No input, returns TOutput (can't fail), sync
 * 8. No input, returns Promise<TOutput> (can't fail), async
 */

/** 1. With input, returns Result, sync */
export function defineMutation<
	TOutput,
	TError extends TaggedError<string>,
	TInput extends StandardSchemaV1,
>(config: {
	input: TInput;
	handler: (
		input: StandardSchemaV1.InferOutput<NoInfer<TInput>>,
	) => Result<TOutput, TError>;
	description?: string;
}): Mutation<TOutput, TError, TInput, false>;

/** 2. With input, returns Result, async */
export function defineMutation<
	TOutput,
	TError extends TaggedError<string>,
	TInput extends StandardSchemaV1,
>(config: {
	input: TInput;
	handler: (
		input: StandardSchemaV1.InferOutput<NoInfer<TInput>>,
	) => Promise<Result<TOutput, TError>>;
	description?: string;
}): Mutation<TOutput, TError, TInput, true>;

/** 3. With input, returns TOutput (can't fail), sync */
export function defineMutation<
	TOutput,
	TInput extends StandardSchemaV1,
>(config: {
	input: TInput;
	handler: (
		input: StandardSchemaV1.InferOutput<NoInfer<TInput>>,
	) => TOutput;
	description?: string;
}): Mutation<TOutput, never, TInput, false>;

/** 4. With input, returns Promise<TOutput> (can't fail), async */
export function defineMutation<
	TOutput,
	TInput extends StandardSchemaV1,
>(config: {
	input: TInput;
	handler: (
		input: StandardSchemaV1.InferOutput<NoInfer<TInput>>,
	) => Promise<TOutput>;
	description?: string;
}): Mutation<TOutput, never, TInput, true>;

/** 5. No input, returns Result, sync */
export function defineMutation<
	TOutput,
	TError extends TaggedError<string>,
>(config: {
	handler: () => Result<TOutput, TError>;
	description?: string;
}): Mutation<TOutput, TError, undefined, false>;

/** 6. No input, returns Result, async */
export function defineMutation<
	TOutput,
	TError extends TaggedError<string>,
>(config: {
	handler: () => Promise<Result<TOutput, TError>>;
	description?: string;
}): Mutation<TOutput, TError, undefined, true>;

/** 7. No input, returns TOutput (can't fail), sync */
export function defineMutation<TOutput>(config: {
	handler: () => TOutput;
	description?: string;
}): Mutation<TOutput, never, undefined, false>;

/** 8. No input, returns Promise<TOutput> (can't fail), async */
export function defineMutation<TOutput>(config: {
	handler: () => Promise<TOutput>;
	description?: string;
}): Mutation<TOutput, never, undefined, true>;

/**
 * Implementation for defineMutation
 *
 * Creates a Mutation action that passes through handler results directly.
 *
 * Handlers can return either raw values (T) or Result types (Result<T, E>).
 * The return value is passed through as-is with no wrapping.
 *
 * Input validation should be handled by external middleware (e.g., Hono's validator)
 * or manual validation when needed (e.g., in MCP server).
 */
// biome-ignore lint/suspicious/noExplicitAny: Implementation must be general to support all overload combinations. Type safety is enforced through the overload signatures above.
export function defineMutation(config: ActionConfig): any {
	return Object.assign((input: unknown) => (config.handler as any)(input), {
		type: 'mutation' as const,
		input: config.input,
		description: config.description,
	});
}

/**
 * Configuration for defining an action (query or mutation)
 *
 * Handlers can return either raw values (T) or Result types (Result<T, E>).
 * Raw values are implicitly wrapped in Ok() at runtime.
 */
type ActionConfig = {
	input?: StandardSchemaV1;
	handler: // biome-ignore lint/suspicious/noExplicitAny: Handler return type uses `any` to support all combinations: raw values (T), Result types (Result<T,E>), sync, and async. Type safety is enforced through the overload signatures above, not this shared config type.
		| (() => any | Promise<any>)
		// biome-ignore lint/suspicious/noExplicitAny: Handler return type uses `any` to support all combinations: raw values (T), Result types (Result<T,E>), sync, and async. Type safety is enforced through the overload signatures above, not this shared config type.
		| ((input: unknown) => any | Promise<any>);
	description?: string;
};

/**
 * Type guard: Check if a value is an Action (Query or Mutation)
 *
 * Actions are identified by having a `type` property set to 'query' or 'mutation'.
 * This allows runtime filtering of workspace exports to identify which exports
 * should be mapped to API endpoints and MCP tools.
 *
 * @example
 * ```typescript
 * const exports = {
 *   getUser: defineQuery({ ... }),
 *   validateEmail: (email: string) => { ... }
 * };
 *
 * isAction(exports.getUser) // true
 * isAction(exports.validateEmail) // false
 * ```
 */
export function isAction(value: unknown): value is Action {
	return (
		typeof value === 'function' &&
		typeof (value as Action).type === 'string' &&
		((value as Action).type === 'query' || (value as Action).type === 'mutation')
	);
}

/**
 * Type guard: Check if a value is a Query action
 *
 * @example
 * ```typescript
 * const getUser = defineQuery({ ... });
 * const createUser = defineMutation({ ... });
 *
 * isQuery(getUser) // true
 * isQuery(createUser) // false
 * ```
 */
export function isQuery(value: unknown): value is Query {
	return isAction(value) && value.type === 'query';
}

/**
 * Type guard: Check if a value is a Mutation action
 *
 * @example
 * ```typescript
 * const getUser = defineQuery({ ... });
 * const createUser = defineMutation({ ... });
 *
 * isMutation(getUser) // false
 * isMutation(createUser) // true
 * ```
 */
export function isMutation(value: unknown): value is Mutation {
	return isAction(value) && value.type === 'mutation';
}

/**
 * Extract only the actions from workspace exports
 *
 * Used by API/MCP mappers to identify what to expose as endpoints.
 * Non-action exports are ignored and remain accessible through the client.
 *
 * @example
 * ```typescript
 * const exports = {
 *   getUser: defineQuery({ ... }),
 *   createUser: defineMutation({ ... }),
 *   validateEmail: (email: string) => { ... },
 *   constants: { MAX_USERS: 1000 }
 * };
 *
 * const actions = extractActions(exports);
 * // actions = { getUser, createUser } only
 *
 * // Use in API/MCP mapping
 * for (const [name, action] of Object.entries(actions)) {
 *   if (isQuery(action)) {
 *     app.get(`/api/${name}`, ...);
 *   } else if (isMutation(action)) {
 *     app.post(`/api/${name}`, ...);
 *   }
 * }
 * ```
 */
export function extractActions(exports: WorkspaceExports): WorkspaceActionMap {
	return Object.fromEntries(
		Object.entries(exports).filter(([_, value]) => isAction(value)),
	) as WorkspaceActionMap;
}

/**
 * Helper to define workspace exports with full type inference
 *
 * Identity function similar to defineIndexExports. Provides type safety
 * and better IDE support when defining workspace exports.
 *
 * @example
 * ```typescript
 * const exports = defineWorkspaceExports({
 *   getUser: defineQuery({ ... }),
 *   createUser: defineMutation({ ... }),
 *   validateEmail: (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
 *   constants: { MAX_USERS: 1000 }
 * });
 * // Type is fully inferred: {
 * //   getUser: Query<...>,
 * //   createUser: Mutation<...>,
 * //   validateEmail: (email: string) => boolean,
 * //   constants: { MAX_USERS: number }
 * // }
 * ```
 */
export function defineWorkspaceExports<T extends WorkspaceExports>(
	exports: T,
): T {
	return exports;
}

