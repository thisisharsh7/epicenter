import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { TaggedError } from 'wellcrafted/error';
import type { Result } from 'wellcrafted/result';
import { Ok, isResult } from 'wellcrafted/result';

/**
 * A collection of workspace actions indexed by action name.
 *
 * Each workspace exposes its functionality through a set of typed actions
 * that can be called by other workspaces or external consumers.
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
 * Returns Ok<TOutput> when TError is never (handler can't fail)
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
	 * - TError = never: Returns Ok<TOutput> (handler can't fail, always succeeds)
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
			? Promise<Ok<TOutput>> // Handler can't fail, returns Ok
			: Promise<Result<TOutput, TError>> // Handler can fail, returns Result
		: // Level 2 (sync): Can handler fail?
			[TError] extends [never]
			? Ok<TOutput> // Handler can't fail, returns Ok
			: Result<TOutput, TError>; // Handler can fail, returns Result

	// Metadata properties
	type: 'query';
	input?: TInput;
	description?: string;
};

/**
 * Mutation action: write operation that modifies state
 *
 * Returns Ok<TOutput> when TError is never (handler can't fail)
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
	 * - TError = never: Returns Ok<TOutput> (handler can't fail, always succeeds)
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
			? Promise<Ok<TOutput>> // Handler can't fail, returns Ok
			: Promise<Result<TOutput, TError>> // Handler can fail, returns Result
		: // Level 2 (sync): Can handler fail?
			[TError] extends [never]
			? Ok<TOutput> // Handler can't fail, returns Ok
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
 * Creates a Query action that wraps handlers to ensure consistent Result types.
 *
 * Handlers can return either raw values (T) or Result types (Result<T, E>).
 * Raw values are automatically wrapped in Ok() at runtime.
 *
 * Input validation should be handled by external middleware (e.g., Hono's validator)
 * or manual validation when needed (e.g., in MCP server).
 */
// biome-ignore lint/suspicious/noExplicitAny: Implementation must be general to support all overload combinations. Type safety is enforced through the overload signatures above.
export function defineQuery(config: ActionConfig): any {
	const inputSchema = config.input;

	// Helper: Wraps handler result in Ok() if not already a Result
	const ensureWrappedResult = (result: unknown) => {
		// Handle async case
		if (result instanceof Promise) {
			return result.then((r) => (isResult(r) ? r : Ok(r)));
		}

		// Handle sync case
		return isResult(result) ? result : Ok(result);
	};

	// Handler that wraps result in Ok() if needed
	const wrappedHandler = (input: unknown) =>
		ensureWrappedResult((config.handler as any)(input));

	return Object.assign(wrappedHandler, {
		type: 'query' as const,
		input: inputSchema,
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
 * Creates a Mutation action that wraps handlers to ensure consistent Result types.
 *
 * Handlers can return either raw values (T) or Result types (Result<T, E>).
 * Raw values are automatically wrapped in Ok() at runtime.
 *
 * Input validation should be handled by external middleware (e.g., Hono's validator)
 * or manual validation when needed (e.g., in MCP server).
 */
// biome-ignore lint/suspicious/noExplicitAny: Implementation must be general to support all overload combinations. Type safety is enforced through the overload signatures above.
export function defineMutation(config: ActionConfig): any {
	const inputSchema = config.input;

	// Helper: Wraps handler result in Ok() if not already a Result
	const ensureWrappedResult = (result: unknown) => {
		// Handle async case
		if (result instanceof Promise) {
			return result.then((r) => (isResult(r) ? r : Ok(r)));
		}

		// Handle sync case
		return isResult(result) ? result : Ok(result);
	};

	// Handler that wraps result in Ok() if needed
	const wrappedHandler = (input: unknown) =>
		ensureWrappedResult((config.handler as any)(input));

	return Object.assign(wrappedHandler, {
		type: 'mutation' as const,
		input: inputSchema,
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

