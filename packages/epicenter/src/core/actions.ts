import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { TaggedError } from 'wellcrafted/error';
import { createTaggedError } from 'wellcrafted/error';
import type { Result } from 'wellcrafted/result';
import { Err, Ok } from 'wellcrafted/result';

/**
 * Error thrown when action input validation fails
 */
export const { ValidationError, ValidationErr } = createTaggedError<
	'ValidationError',
	{ issues: readonly StandardSchemaV1.Issue[] }
>('ValidationError');
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
 * Composes validation, handler execution, and result wrapping
 */
export function defineQuery(config: ActionConfig) {
	const inputSchema = config.input;
	const handler = inputSchema
		? (arg: unknown) => {
				const validationResult = inputSchema['~standard'].validate(arg);
				const validated = validateInput(validationResult);

				// Handle async validation
				if (validated instanceof Promise) {
					return validated.then(
						({ data: validatedInput, error: validateInputError }) => {
							if (validateInputError) return Err(validateInputError);
							return wrapHandlerResult(config.handler(validatedInput));
						},
					);
				}

				const { data: validatedInput, error: validateInputError } = validated;
				// Handle sync validation
				if (validateInputError) return Err(validateInputError);
				return wrapHandlerResult(config.handler(validatedInput));
			}
		: config.handler;

	return Object.assign(handler, {
		type: 'query' as const,
		input: inputSchema,
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
 * Composes validation, handler execution, and result wrapping
 */
export function defineMutation(config: ActionConfig) {
	const inputSchema = config.input;
	const handler = inputSchema
		? (arg: unknown) => {
				const validationResult = inputSchema['~standard'].validate(arg);
				const validated = validateInput(validationResult);

				// Handle async validation
				if (validated instanceof Promise) {
					return validated.then((result) => {
						if (result.error) return result;
						return wrapHandlerResult(config.handler(result.data));
					});
				}

				// Handle sync validation
				if (validated.error) return validated;
				return wrapHandlerResult(config.handler(validated.data));
			}
		: config.handler;

	return Object.assign(handler, {
		type: 'mutation' as const,
		input: inputSchema,
		description: config.description,
	});
}

/**
 * Configuration for defining an action (query or mutation)
 */
type ActionConfig = {
	input?: StandardSchemaV1;
	handler: // biome-ignore lint/suspicious/noExplicitAny: Handler return type uses `any` to support all return type combinations: sync/async (T vs Promise<T>) and Result vs raw value (Result<T,E> vs T). Type safety is enforced through the overload signatures above, not this shared config type.
		| (() => any | Result<any, any>)
		// biome-ignore lint/suspicious/noExplicitAny: Handler return type uses `any` to support all return type combinations: sync/async (T vs Promise<T>) and Result vs raw value (Result<T,E> vs T). Type safety is enforced through the overload signatures above, not this shared config type.
		| ((input: unknown) => any | Result<any, any>);
	description?: string;
};

/**
 * Helper: Wraps handler result in Ok() if it's not already a Result
 * Handles both sync and async handler results
 */
// biome-ignore lint/suspicious/noExplicitAny: Return type must be `any` because it can be Promise<Result<T,E>>, Result<T,E>, or Result<T,never> depending on input, and we cannot precisely type this without propagating generics through the call chain. The function uses runtime type guards (instanceof Promise, isResult) to handle all cases safely.
function wrapHandlerResult(result: unknown): any {
	if (result instanceof Promise) {
		return result.then((resolved) =>
			isResult(resolved) ? resolved : Ok(resolved),
		);
	}
	return isResult(result) ? result : Ok(result);
}

/**
 * Helper: Validates input and returns Result
 * Handles both sync and async validation
 */
function validateInput(
	validationResult:
		| StandardSchemaV1.Result<unknown>
		| Promise<StandardSchemaV1.Result<unknown>>,
):
	| Result<unknown, ValidationError>
	| Promise<Result<unknown, ValidationError>> {
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
			return Ok(validated.value);
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

	return Ok(validationResult.value);
}
