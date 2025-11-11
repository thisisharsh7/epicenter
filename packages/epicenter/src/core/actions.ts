import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { TaggedError } from 'wellcrafted/error';
import { createTaggedError } from 'wellcrafted/error';
import type { Result } from 'wellcrafted/result';
import { Ok, isResult } from 'wellcrafted/result';

/**
 * Error thrown when action input validation fails
 */
export const { ValidationError, ValidationErr } =
	createTaggedError('ValidationError');
export type ValidationError = ReturnType<typeof ValidationError>;

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
> =
	| Query<TOutput, TError, TInput, TAsync>
	| Mutation<TOutput, TError, TInput, TAsync>;

/**
 * Query action - read operation with no side effects
 *
 * When TInput exists, input validation can fail, so returns are wrapped in Result<T, ValidationError | TError>.
 * When TInput is undefined and TError extends never, returns TOutput directly (no Result wrapper).
 * When TAsync is true, returns a Promise; when false, returns synchronously.
 */
export type Query<
	TOutput = unknown,
	TError extends TaggedError<string> | never = never,
	TInput extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
	TAsync extends boolean = boolean,
> = {
	// Callable signature - conditionally returns Result or raw output based on TInput, TError, and TAsync
	(
		...args: TInput extends StandardSchemaV1
			? [input: StandardSchemaV1.InferOutput<TInput>]
			: []
	): // Level 1: Async or Sync?
	TAsync extends true
		? //  Level 2: Has Input Schema?
			TInput extends StandardSchemaV1
			? //  Level 3: Can Handler Fail?
				[TError] extends [never]
				? Promise<Result<TOutput, ValidationError>>
				: Promise<Result<TOutput, TError | ValidationError>>
			: // Level 3: Can Handler Fail?
				[TError] extends [never]
				? Promise<TOutput>
				: Promise<Result<TOutput, TError>>
		: // Level 2: Has Input Schema?
			TInput extends StandardSchemaV1
			? // Level 3: Can Handler Fail?
				[TError] extends [never]
				? Result<TOutput, ValidationError>
				: Result<TOutput, TError | ValidationError>
			: // Level 3: Can Handler Fail?
				[TError] extends [never]
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
 * When TInput exists, input validation can fail, so returns are wrapped in Result<T, ValidationError | TError>.
 * When TInput is undefined and TError extends never, returns TOutput directly (no Result wrapper).
 * When TAsync is true, returns a Promise; when false, returns synchronously.
 */
export type Mutation<
	TOutput = unknown,
	TError extends TaggedError<string> | never = never,
	TInput extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
	TAsync extends boolean = boolean,
> = {
	// Callable signature - conditionally returns Result or raw output based on TInput, TError, and TAsync
	(
		...args: TInput extends StandardSchemaV1
			? [input: StandardSchemaV1.InferOutput<TInput>]
			: []
	): // Level 1: Async of Sync?
	TAsync extends true
		? //  Level 2: Has Input Schema?
			TInput extends StandardSchemaV1
			? // Level 3: Can Handler Fail?
				[TError] extends [never]
				? Promise<Result<TOutput, ValidationError>>
				: Promise<Result<TOutput, TError | ValidationError>>
			: // Level 3: Can Handler Fail?
				[TError] extends [never]
				? Promise<TOutput>
				: Promise<Result<TOutput, TError>>
		: // Level 2: Has Input Schema?
			TInput extends StandardSchemaV1
			? // Level 3: Can Handler Fail?
				[TError] extends [never]
				? Result<TOutput, ValidationError>
				: Result<TOutput, TError | ValidationError>
			: // Level 3: Can Handler Fail?
				[TError] extends [never]
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
}): Query<TOutput, TError | ValidationError, TInput, false>;

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
}): Query<TOutput, TError | ValidationError, TInput, true>;

/** 3. With input, returns raw value (can't fail), sync */
export function defineQuery<TOutput, TInput extends StandardSchemaV1>(config: {
	input: TInput;
	handler: (input: StandardSchemaV1.InferOutput<NoInfer<TInput>>) => TOutput;
	description?: string;
}): Query<
	TOutput extends void ? undefined : TOutput,
	ValidationError,
	TInput,
	false
>;

/** 4. With input, returns raw value (can't fail), async */
export function defineQuery<TOutput, TInput extends StandardSchemaV1>(config: {
	input: TInput;
	handler: (
		input: StandardSchemaV1.InferOutput<NoInfer<TInput>>,
	) => Promise<TOutput>;
	description?: string;
}): Query<
	TOutput extends void ? undefined : TOutput,
	ValidationError,
	TInput,
	true
>;

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
 * Uses shared action wrapper logic - see createActionWrapper for details
 */
// biome-ignore lint/suspicious/noExplicitAny: Return type is `any` because the function returns a callable with metadata properties. The actual return type (Query<TOutput, TError, TInput, TAsync>) is enforced through the 8 overload signatures above, which provide full type safety at call sites.
export function defineQuery(config: ActionConfig): any {
	// biome-ignore lint/suspicious/noExplicitAny: Wrapper must accept any[] to support both parameterless queries ([]) and queries with input ([input]). Type safety is provided by Query's callable signature and runtime StandardSchema validation.
	const wrappedHandler = (...args: any[]) => {
		if (config.input && args.length > 0) {
			const validationResult = config.input['~standard'].validate(args[0]);
			return validateAndExecuteHandler({
				validationResult,
				handler: config.handler,
			});
		}

		// No input schema - pass through directly
		// JavaScript automatically handles Promise/Result/raw value passthrough
		return config.handler(...args);
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
}): Mutation<TOutput, TError | ValidationError, TInput, false>;

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
}): Mutation<TOutput, TError | ValidationError, TInput, true>;

/** 3. With input, returns raw value (can't fail), sync */
export function defineMutation<
	TOutput,
	TInput extends StandardSchemaV1,
>(config: {
	input: TInput;
	handler: (input: StandardSchemaV1.InferOutput<NoInfer<TInput>>) => TOutput;
	description?: string;
}): Mutation<
	TOutput extends void ? undefined : TOutput,
	ValidationError,
	TInput,
	false
>;

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
}): Mutation<
	TOutput extends void ? undefined : TOutput,
	ValidationError,
	TInput,
	true
>;

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
}): Mutation<
	TOutput extends void ? undefined : TOutput,
	never,
	undefined,
	false
>;

/** 8. No input, returns raw value (can't fail), async */
export function defineMutation<TOutput>(config: {
	handler: () => Promise<TOutput>;
	description?: string;
}): Mutation<
	TOutput extends void ? undefined : TOutput,
	never,
	undefined,
	true
>;

/**
 * Implementation for defineMutation
 *
 * Uses shared action wrapper logic - see createActionWrapper for details
 */
// biome-ignore lint/suspicious/noExplicitAny: Return type is `any` because the function returns a callable with metadata properties. The actual return type (Mutation<TOutput, TError, TInput, TAsync>) is enforced through the 8 overload signatures above, which provide full type safety at call sites.
export function defineMutation(config: ActionConfig): any {
	// biome-ignore lint/suspicious/noExplicitAny: Wrapper must accept any[] to support both parameterless mutations ([]) and mutations with input ([input]). Type safety is provided by Mutation's callable signature and runtime StandardSchema validation.
	const wrappedHandler = (...args: any[]) => {
		if (config.input && args.length > 0) {
			const validationResult = config.input['~standard'].validate(args[0]);
			return validateAndExecuteHandler({
				validationResult,
				handler: config.handler,
			});
		}

		// No input schema - pass through directly
		// JavaScript automatically handles Promise/Result/raw value passthrough
		return config.handler(...args);
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
 * Configuration for defining an action (query or mutation)
 */
type ActionConfig = {
	input?: StandardSchemaV1;
	// biome-ignore lint/suspicious/noExplicitAny: Handler must use `any` for both parameters and return type to support all 8 overload combinations: with/without input (any[] vs []), sync/async (T vs Promise<T>), and Result vs raw value (Result<T,E> vs T). Type safety is enforced through the overload signatures above, not this shared config type.
	handler: (...args: any[]) => any | Result<any, any>;
	description?: string;
};

/**
 * Helper: Validates input and executes handler, wrapping result appropriately
 * Handles both sync and async validation
 */
function validateAndExecuteHandler({
	validationResult,
	handler,
}: {
	validationResult:
		| StandardSchemaV1.Result<unknown>
		| Promise<StandardSchemaV1.Result<unknown>>;
	handler: ActionConfig['handler'];
}):
	| ReturnType<ActionConfig['handler']>
	| Result<ReturnType<ActionConfig['handler']>, ValidationError> {
	/**
	 * Helper: Wraps handler result in Ok() if it's not already a Result
	 * Handles both sync and async handler results
	 */
	// biome-ignore lint/suspicious/noExplicitAny: Return type must be `any` because it can be Promise<Result<T,E>>, Result<T,E>, or Result<T,never> depending on input, and we cannot precisely type this without propagating generics through the call chain. The function uses runtime type guards (instanceof Promise, isResult) to handle all cases safely.
	const wrapHandlerResult = (result: unknown): any => {
		if (result instanceof Promise) {
			return result.then((resolved) =>
				isResult(resolved) ? resolved : Ok(resolved),
			);
		}
		return isResult(result) ? result : Ok(result);
	};

	// Handle async validation
	if (validationResult instanceof Promise) {
		return validationResult.then((validated) => {
			if (validated.issues) {
				return ValidationErr({
					message: 'Input validation failed',
					context: { issues: validated.issues },
					cause: undefined,
				});
			}
			return wrapHandlerResult(handler(validated.value));
		});
	}

	// Handle sync validation
	if (validationResult.issues) {
		return ValidationErr({
			message: 'Input validation failed',
			context: { issues: validationResult.issues },
			cause: undefined,
		});
	}

	return wrapHandlerResult(handler(validationResult.value));
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
