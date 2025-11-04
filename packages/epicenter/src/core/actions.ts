import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { TaggedError } from 'wellcrafted/error';
import { Ok, type Result, isResult } from 'wellcrafted/result';
import type { EpicenterOperationError } from './errors';

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
> = Query<TOutput, TError, TInput> | Mutation<TOutput, TError, TInput>;

/**
 * Query action - read operation with no side effects
 *
 * When TError extends never, returns TOutput directly (no Result wrapper).
 * When TError is a concrete error type, returns Result<TOutput, TError>.
 */
export type Query<
	TOutput = unknown,
	TError extends TaggedError<string> | never = never,
	TInput extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
> = {
	// Callable signature - conditionally returns Result or raw output based on TError
	(
		...args: TInput extends StandardSchemaV1
			? [input: StandardSchemaV1.InferOutput<TInput>]
			: []
	): [TError] extends [never]
		? TOutput | Promise<TOutput>
		: Result<TOutput, TError> | Promise<Result<TOutput, TError>>;
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
 */
export type Mutation<
	TOutput = unknown,
	TError extends TaggedError<string> | never = never,
	TInput extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
> = {
	// Callable signature - conditionally returns Result or raw output based on TError
	(
		...args: TInput extends StandardSchemaV1
			? [input: StandardSchemaV1.InferOutput<TInput>]
			: []
	): [TError] extends [never]
		? TOutput | Promise<TOutput>
		: Result<TOutput, TError> | Promise<Result<TOutput, TError>>;
	// Metadata properties
	type: 'mutation';
	input?: TInput;
	description?: string;
};

/**
 * Helper function to define a query action with input schema that returns Result
 * Returns a callable function with metadata properties attached
 */
export function defineQuery<
	TOutput,
	TError extends TaggedError<string> | never,
	TInput extends StandardSchemaV1,
>(config: {
	input: TInput;
	handler: (
		input: StandardSchemaV1.InferOutput<NoInfer<TInput>>,
	) => Result<TOutput, TError> | Promise<Result<TOutput, TError>>;
	description?: string;
}): Query<TOutput, TError, TInput>;

/**
 * Helper function to define a query action with input schema that returns raw value (can't fail)
 * Returns a callable function with metadata properties attached
 */
export function defineQuery<TOutput, TInput extends StandardSchemaV1>(config: {
	input: TInput;
	handler: (
		input: StandardSchemaV1.InferOutput<NoInfer<TInput>>,
	) => TOutput | Promise<TOutput> | void | Promise<void>;
	description?: string;
}): Query<TOutput extends void ? undefined : TOutput, never, TInput>;

/**
 * Helper function to define a query action without input that returns Result
 * Returns a callable function with metadata properties attached
 */
export function defineQuery<
	TOutput,
	TError extends TaggedError<string> | never,
>(config: {
	handler: () => Result<TOutput, TError> | Promise<Result<TOutput, TError>>;
	description?: string;
}): Query<TOutput, TError, undefined>;

/**
 * Helper function to define a query action without input that returns raw value (can't fail)
 * Returns a callable function with metadata properties attached
 */
export function defineQuery<TOutput>(config: {
	handler: () => TOutput | Promise<TOutput> | void | Promise<void>;
	description?: string;
}): Query<TOutput extends void ? undefined : TOutput, never, undefined>;

/**
 * Implementation for defineQuery
 *
 * This function supports 4 overload patterns through TypeScript's function overloading:
 *
 * 1. **With input, can fail**: Handler takes input and returns Result<TOutput, TError>
 *    - TError is inferred from the Result type returned by handler
 *    - Example: `defineQuery({ input: schema, handler: (data) => Ok(result) or Err(error) })`
 *
 * 2. **With input, can't fail**: Handler takes input and returns raw TOutput or void
 *    - TError is automatically set to `never` (can't fail)
 *    - Wrapped handler returns raw TOutput directly (no Result wrapper)
 *    - Example: `defineQuery({ input: schema, handler: (data) => result })`
 *
 * 3. **No input, can fail**: Handler takes no params and returns Result<TOutput, TError>
 *    - TError is inferred from the Result type returned by handler
 *    - Example: `defineQuery({ handler: () => Ok(result) or Err(error) })`
 *
 * 4. **No input, can't fail**: Handler takes no params and returns raw TOutput or void
 *    - TError is automatically set to `never` (can't fail)
 *    - Wrapped handler returns raw TOutput directly (no Result wrapper)
 *    - Example: `defineQuery({ handler: () => result })`
 *
 * The implementation uses the "let and await promise pattern" to normalize sync/async handlers:
 * - Calls the handler and stores result in a `let` variable (allows reassignment)
 * - Checks if result is a Promise using `instanceof Promise`
 * - If Promise, awaits it and reassigns to the same variable
 * - After this point, result is guaranteed to be the unwrapped value (not a Promise)
 * - If handler returned a Result type, passes it through as-is
 * - Otherwise, returns the raw value directly (no Result wrapper)
 *
 * The wrapped handler is always async (returns Promise) for a uniform interface,
 * even when the original handler is synchronous.
 */
// biome-ignore lint/suspicious/noExplicitAny: This is the implementation function that handles all 4 overload signatures of defineQuery. TypeScript's overloads provide type safety at call sites, while the implementation uses `any` to handle the union of all possible parameter/return types (with input vs without, Result vs raw value, etc.). The type safety is enforced through the overload signatures, not the implementation.
export function defineQuery(config: any): any {
	// biome-ignore lint/suspicious/noExplicitAny: Handler function must accept variable arguments to support both parameterless queries and queries with input parameters. The actual type safety is provided by the Query type's callable signature and StandardSchema validation at runtime.
	const wrappedHandler = async (...args: any[]) => {
		// Call the user's handler with whatever arguments were passed
		let result = config.handler(...args);

		// Normalize Promise vs non-Promise: await if needed
		// This is the "let and await promise pattern" - by checking instanceof Promise
		// and conditionally awaiting, we avoid duplicating the logic below for both
		// sync and async cases
		if (result instanceof Promise) {
			result = await result;
		}

		// At this point, result is the unwrapped value (could be Result, raw value, or undefined)
		// If the handler already returned a Result type (Ok or Err), pass it through
		if (isResult(result)) return result;

		// Otherwise, return the raw value directly (don't wrap in Result)
		// This matches the conditional return type: when TError = never, return TOutput directly
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
 * Helper function to define a mutation action with input schema that returns Result
 * Returns a callable function with metadata properties attached
 */
export function defineMutation<
	TOutput,
	TError extends TaggedError<string> | never,
	TInput extends StandardSchemaV1,
>(config: {
	input: TInput;
	handler: (
		input: StandardSchemaV1.InferOutput<NoInfer<TInput>>,
	) => Result<TOutput, TError> | Promise<Result<TOutput, TError>>;
	description?: string;
}): Mutation<TOutput, TError, TInput>;

/**
 * Helper function to define a mutation action with input schema that returns raw value (can't fail)
 * Returns a callable function with metadata properties attached
 */
export function defineMutation<
	TOutput,
	TInput extends StandardSchemaV1,
>(config: {
	input: TInput;
	handler: (
		input: StandardSchemaV1.InferOutput<NoInfer<TInput>>,
	) => TOutput | Promise<TOutput> | void | Promise<void>;
	description?: string;
}): Mutation<TOutput extends void ? undefined : TOutput, never, TInput>;

/**
 * Helper function to define a mutation action without input that returns Result
 * Returns a callable function with metadata properties attached
 */
export function defineMutation<
	TOutput,
	TError extends TaggedError<string> | never,
>(config: {
	handler: () => Result<TOutput, TError> | Promise<Result<TOutput, TError>>;
	description?: string;
}): Mutation<TOutput, TError, undefined>;

/**
 * Helper function to define a mutation action without input that returns raw value (can't fail)
 * Returns a callable function with metadata properties attached
 */
export function defineMutation<TOutput>(config: {
	handler: () => TOutput | Promise<TOutput> | void | Promise<void>;
	description?: string;
}): Mutation<TOutput extends void ? undefined : TOutput, never, undefined>;

/**
 * Implementation for defineMutation
 *
 * This function supports 4 overload patterns through TypeScript's function overloading:
 *
 * 1. **With input, can fail**: Handler takes input and returns Result<TOutput, TError>
 *    - TError is inferred from the Result type returned by handler
 *    - Example: `defineMutation({ input: schema, handler: (data) => Ok(result) or Err(error) })`
 *
 * 2. **With input, can't fail**: Handler takes input and returns raw TOutput or void
 *    - TError is automatically set to `never` (can't fail)
 *    - Wrapped handler returns raw TOutput directly (no Result wrapper)
 *    - Example: `defineMutation({ input: schema, handler: (data) => { ...sideEffect } })`
 *
 * 3. **No input, can fail**: Handler takes no params and returns Result<TOutput, TError>
 *    - TError is inferred from the Result type returned by handler
 *    - Example: `defineMutation({ handler: () => Ok(result) or Err(error) })`
 *
 * 4. **No input, can't fail**: Handler takes no params and returns raw TOutput or void
 *    - TError is automatically set to `never` (can't fail)
 *    - Wrapped handler returns raw TOutput directly (no Result wrapper)
 *    - Example: `defineMutation({ handler: () => { ...sideEffect } })`
 *
 * The implementation uses the "let and await promise pattern" to normalize sync/async handlers:
 * - Calls the handler and stores result in a `let` variable (allows reassignment)
 * - Checks if result is a Promise using `instanceof Promise`
 * - If Promise, awaits it and reassigns to the same variable
 * - After this point, result is the unwrapped value (not a Promise)
 * - If handler returned a Result type, passes it through as-is
 * - Otherwise, returns the raw value directly (no Result wrapper)
 *
 * The wrapped handler is always async (returns Promise) for a uniform interface,
 * even when the original handler is synchronous.
 */
// biome-ignore lint/suspicious/noExplicitAny: This is the implementation function that handles all 4 overload signatures of defineMutation. TypeScript's overloads provide type safety at call sites, while the implementation uses `any` to handle the union of all possible parameter/return types (with input vs without, Result vs raw value, etc.). The type safety is enforced through the overload signatures, not the implementation.
export function defineMutation(config: any): any {
	// biome-ignore lint/suspicious/noExplicitAny: Handler function must accept variable arguments to support both parameterless mutations and mutations with input parameters. The actual type safety is provided by the Mutation type's callable signature and StandardSchema validation at runtime.
	const wrappedHandler = async (...args: any[]) => {
		// Call the user's handler with whatever arguments were passed
		let result = config.handler(...args);

		// Normalize Promise vs non-Promise: await if needed
		// This is the "let and await promise pattern" - by checking instanceof Promise
		// and conditionally awaiting, we avoid duplicating the logic below for both
		// sync and async cases
		if (result instanceof Promise) {
			result = await result;
		}

		// At this point, result is the unwrapped value (could be Result, raw value, or undefined)
		// If the handler already returned a Result type (Ok or Err), pass it through
		if (isResult(result)) return result;

		// Otherwise, return the raw value directly (don't wrap in Result)
		// This matches the conditional return type: when TError = never, return TOutput directly
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
