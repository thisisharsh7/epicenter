import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { TaggedError } from 'wellcrafted/error';
import type { Result } from 'wellcrafted/result';
import { isResult } from 'wellcrafted/result';

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
	TError extends TaggedError<string> | never = never,
	TInput extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
	TAsync extends boolean = boolean,
> = Query<TOutput, TError, TInput, TAsync> | Mutation<TOutput, TError, TInput, TAsync>;

/**
 * Query action - read operation with no side effects
 *
 * When TError extends never, returns TOutput directly (no Result wrapper).
 * When TError is a concrete error type, returns Result<TOutput, TError>.
 * When TAsync is true, returns a Promise; when false, returns synchronously.
 */
export type Query<
	TOutput = unknown,
	TError extends TaggedError<string> | never = never,
	TInput extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
	TAsync extends boolean = boolean,
> = {
	// Callable signature - conditionally returns Result or raw output based on TError and TAsync
	(
		...args: TInput extends StandardSchemaV1
			? [input: StandardSchemaV1.InferOutput<TInput>]
			: []
	): TAsync extends true
		? [TError] extends [never]
			? Promise<TOutput>
			: Promise<Result<TOutput, TError>>
		: [TError] extends [never]
			? TOutput
			: Result<TOutput, TError>;
	// Metadata properties
	type: 'query';
	input?: TInput;
	description?: string;
};

/**
 * Mutation action - write operation that modifies state
 *
 * When TError extends never, returns TOutput directly (no Result wrapper).
 * When TError is a concrete error type, returns Result<TOutput, TError>.
 * When TAsync is true, returns a Promise; when false, returns synchronously.
 */
export type Mutation<
	TOutput = unknown,
	TError extends TaggedError<string> | never = never,
	TInput extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
	TAsync extends boolean = boolean,
> = {
	// Callable signature - conditionally returns Result or raw output based on TError and TAsync
	(
		...args: TInput extends StandardSchemaV1
			? [input: StandardSchemaV1.InferOutput<TInput>]
			: []
	): TAsync extends true
		? [TError] extends [never]
			? Promise<TOutput>
			: Promise<Result<TOutput, TError>>
		: [TError] extends [never]
			? TOutput
			: Result<TOutput, TError>;
	// Metadata properties
	type: 'mutation';
	input?: TInput;
	description?: string;
};

/**
 * defineQuery overloads - 8 combinations covering all handler patterns:
 *
 * 1. With input, returns Result, sync
 * 2. With input, returns Result, async
 * 3. With input, returns raw value (can't fail), sync
 * 4. With input, returns raw value (can't fail), async
 * 5. No input, returns Result, sync
 * 6. No input, returns Result, async
 * 7. No input, returns raw value (can't fail), sync
 * 8. No input, returns raw value (can't fail), async
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

/** 3. With input, returns raw value (can't fail), sync */
export function defineQuery<TOutput, TInput extends StandardSchemaV1>(config: {
	input: TInput;
	handler: (
		input: StandardSchemaV1.InferOutput<NoInfer<TInput>>,
	) => TOutput;
	description?: string;
}): Query<TOutput extends void ? undefined : TOutput, never, TInput, false>;

/** 4. With input, returns raw value (can't fail), async */
export function defineQuery<TOutput, TInput extends StandardSchemaV1>(config: {
	input: TInput;
	handler: (
		input: StandardSchemaV1.InferOutput<NoInfer<TInput>>,
	) => Promise<TOutput>;
	description?: string;
}): Query<TOutput extends void ? undefined : TOutput, never, TInput, true>;

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

/** 7. No input, returns raw value (can't fail), sync */
export function defineQuery<TOutput>(config: {
	handler: () => TOutput;
	description?: string;
}): Query<TOutput extends void ? undefined : TOutput, never, undefined, false>;

/** 8. No input, returns raw value (can't fail), async */
export function defineQuery<TOutput>(config: {
	handler: () => Promise<TOutput>;
	description?: string;
}): Query<TOutput extends void ? undefined : TOutput, never, undefined, true>;

/**
 * Implementation for defineQuery
 *
 * Supports 8 overload patterns to distinguish sync vs async handlers:
 * - With/without input × Result/raw value × sync/async = 8 combinations
 *
 * Why we track sync vs async separately:
 * Without this, TypeScript thinks all handlers return `T | Promise<T>`, forcing you to
 * await even synchronous operations. By using separate overloads that set `TAsync` to
 * true or false, TypeScript knows exactly when await is required.
 *
 * The implementation preserves the handler's sync/async behavior:
 * - Sync handler → returns value directly (no Promise wrapper)
 * - Async handler → returns Promise
 * - This allows compile-time enforcement of correct await usage
 */
// biome-ignore lint/suspicious/noExplicitAny: This is the implementation function that handles all 8 overload signatures of defineQuery. TypeScript's overloads provide type safety at call sites, while the implementation uses `any` to handle the union of all possible parameter/return types (with input vs without, Result vs raw value, sync vs async, etc.). The type safety is enforced through the overload signatures, not the implementation.
export function defineQuery(config: any): any {
	// biome-ignore lint/suspicious/noExplicitAny: Handler function must accept variable arguments to support both parameterless queries and queries with input parameters. The actual type safety is provided by the Query type's callable signature and StandardSchema validation at runtime.
	const wrappedHandler = (...args: any[]) => {
		// Call the user's handler with whatever arguments were passed
		const result = config.handler(...args);

		// If handler returned a Promise, handle it asynchronously
		if (result instanceof Promise) {
			return result.then((resolved) => {
				// If the handler returned a Result type (Ok or Err), pass it through
				if (isResult(resolved)) return resolved;
				// Otherwise, return the raw value directly (no Result wrapper)
				return resolved;
			});
		}

		// Synchronous path: handler returned a value directly (not a Promise)
		// If the handler returned a Result type (Ok or Err), pass it through
		if (isResult(result)) return result;

		// Otherwise, return the raw value directly (no Result wrapper)
		return result;
	};

	// Attach metadata properties to the wrapped handler function
	// This creates a callable function that also has type/input/description properties
	return Object.assign(wrappedHandler, {
		type: 'query' as const,
		input: config.input,
		description: config.description,
	});
}

/**
 * defineMutation overloads - 8 combinations covering all handler patterns:
 *
 * 1. With input, returns Result, sync
 * 2. With input, returns Result, async
 * 3. With input, returns raw value (can't fail), sync
 * 4. With input, returns raw value (can't fail), async
 * 5. No input, returns Result, sync
 * 6. No input, returns Result, async
 * 7. No input, returns raw value (can't fail), sync
 * 8. No input, returns raw value (can't fail), async
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

/** 3. With input, returns raw value (can't fail), sync */
export function defineMutation<
	TOutput,
	TInput extends StandardSchemaV1,
>(config: {
	input: TInput;
	handler: (
		input: StandardSchemaV1.InferOutput<NoInfer<TInput>>,
	) => TOutput;
	description?: string;
}): Mutation<TOutput extends void ? undefined : TOutput, never, TInput, false>;

/** 4. With input, returns raw value (can't fail), async */
export function defineMutation<
	TOutput,
	TInput extends StandardSchemaV1,
>(config: {
	input: TInput;
	handler: (
		input: StandardSchemaV1.InferOutput<NoInfer<TInput>>,
	) => Promise<TOutput>;
	description?: string;
}): Mutation<TOutput extends void ? undefined : TOutput, never, TInput, true>;

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

/** 7. No input, returns raw value (can't fail), sync */
export function defineMutation<TOutput>(config: {
	handler: () => TOutput;
	description?: string;
}): Mutation<TOutput extends void ? undefined : TOutput, never, undefined, false>;

/** 8. No input, returns raw value (can't fail), async */
export function defineMutation<TOutput>(config: {
	handler: () => Promise<TOutput>;
	description?: string;
}): Mutation<TOutput extends void ? undefined : TOutput, never, undefined, true>;

/**
 * Implementation for defineMutation
 *
 * Supports 8 overload patterns to distinguish sync vs async handlers:
 * - With/without input × Result/raw value × sync/async = 8 combinations
 *
 * Why we track sync vs async separately:
 * Without this, TypeScript thinks all handlers return `T | Promise<T>`, forcing you to
 * await even synchronous operations. By using separate overloads that set `TAsync` to
 * true or false, TypeScript knows exactly when await is required.
 *
 * The implementation preserves the handler's sync/async behavior:
 * - Sync handler → returns value directly (no Promise wrapper)
 * - Async handler → returns Promise
 * - This allows compile-time enforcement of correct await usage
 */
// biome-ignore lint/suspicious/noExplicitAny: This is the implementation function that handles all 8 overload signatures of defineMutation. TypeScript's overloads provide type safety at call sites, while the implementation uses `any` to handle the union of all possible parameter/return types (with input vs without, Result vs raw value, sync vs async, etc.). The type safety is enforced through the overload signatures, not the implementation.
export function defineMutation(config: any): any {
	// biome-ignore lint/suspicious/noExplicitAny: Handler function must accept variable arguments to support both parameterless mutations and mutations with input parameters. The actual type safety is provided by the Mutation type's callable signature and StandardSchema validation at runtime.
	const wrappedHandler = (...args: any[]) => {
		// Call the user's handler with whatever arguments were passed
		const result = config.handler(...args);

		// If handler returned a Promise, handle it asynchronously
		if (result instanceof Promise) {
			return result.then((resolved) => {
				// If the handler returned a Result type (Ok or Err), pass it through
				if (isResult(resolved)) return resolved;
				// Otherwise, return the raw value directly (no Result wrapper)
				return resolved;
			});
		}

		// Synchronous path: handler returned a value directly (not a Promise)
		// If the handler returned a Result type (Ok or Err), pass it through
		if (isResult(result)) return result;

		// Otherwise, return the raw value directly (no Result wrapper)
		return result;
	};

	// Attach metadata properties to the wrapped handler function
	// This creates a callable function that also has type/input/description properties
	return Object.assign(wrappedHandler, {
		type: 'mutation' as const,
		input: config.input,
		description: config.description,
	});
}

/**
 * Type helper to check if an action is a query
 */
export function isQuery<T extends Action>(action: T): action is T & Query {
	return action.type === 'query';
}

/**
 * Type helper to check if an action is a mutation
 */
export function isMutation<T extends Action>(
	action: T,
): action is T & Mutation {
	return action.type === 'mutation';
}
