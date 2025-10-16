import type { TSchema, Static } from 'typebox';
import type { Result } from 'wellcrafted/result';
import type { EpicenterOperationError } from './errors';

/**
 * A collection of workspace actions indexed by action name.
 *
 * Each workspace exposes its functionality through a set of typed actions
 * that can be called by other workspaces or external consumers.
 */
export type WorkspaceActionMap = Record<string, Action<any, any>>;

/**
 * Action type - callable function with metadata properties
 * Can be either a query or mutation
 */
export type Action<
	TInput extends TSchema | undefined = TSchema | undefined,
	TOutput = unknown,
> = Query<TInput, TOutput> | Mutation<TInput, TOutput>;

/**
 * Query action - read operation with no side effects
 */
export type Query<
	TInput extends TSchema | undefined = TSchema | undefined,
	TOutput = unknown,
> = {
	// Callable signature - properly infers input based on whether TInput is TSchema or undefined
	(input: TInput extends TSchema ? Static<TInput> : undefined):
		| Result<TOutput, EpicenterOperationError>
		| Promise<Result<TOutput, EpicenterOperationError>>;
	// Metadata properties
	type: 'query';
	input?: TInput;
	description?: string;
};

/**
 * Mutation action - write operation that modifies state
 */
export type Mutation<
	TInput extends TSchema | undefined = TSchema | undefined,
	TOutput = unknown,
> = {
	// Callable signature - properly infers input based on whether TInput is TSchema or undefined
	(input: TInput extends TSchema ? Static<TInput> : undefined):
		| Result<TOutput, EpicenterOperationError>
		| Promise<Result<TOutput, EpicenterOperationError>>;
	// Metadata properties
	type: 'mutation';
	input?: TInput;
	description?: string;
};

/**
 * Helper function to define a query action
 * Returns a callable function with metadata properties attached
 */
export function defineQuery<
	TOutput,
	TInput extends TSchema | undefined = undefined,
>(config: {
	input?: TInput;
	handler: (
		input: TInput extends TSchema ? Static<TInput> : undefined,
	) =>
		| Result<TOutput, EpicenterOperationError>
		| Promise<Result<TOutput, EpicenterOperationError>>;
	description?: string;
}): Query<TInput, TOutput> {
	return Object.assign(config.handler, {
		type: 'query' as const,
		input: config.input,
		description: config.description,
	});
}

/**
 * Helper function to define a mutation action
 * Returns a callable function with metadata properties attached
 */
export function defineMutation<
	TOutput,
	TInput extends TSchema | undefined = undefined,
>(config: {
	input?: TInput;
	handler: (
		input: TInput extends TSchema ? Static<TInput> : undefined,
	) =>
		| Result<TOutput, EpicenterOperationError>
		| Promise<Result<TOutput, EpicenterOperationError>>;
	description?: string;
}): Mutation<TInput, TOutput> {
	return Object.assign(config.handler, {
		type: 'mutation' as const,
		input: config.input,
		description: config.description,
	});
}

/**
 * Type helper to extract the input type from an action
 */
export type InferActionInput<T> =
	T extends Action<infer TInput, unknown>
		? TInput extends TSchema ? Static<TInput> : undefined
		: never;

/**
 * Type helper to extract the output type from an action
 */
export type InferActionOutput<T> =
	T extends Action<TSchema | undefined, infer O> ? O : never;

/**
 * Type helper to extract the unwrapped output type from an action handler
 * This unwraps the Result type to get the actual success value type
 */
export type InferActionOutputUnwrapped<T> =
	T extends Action<TSchema | undefined, infer O> ? O : never;

/**
 * Type helper to extract the handler function with Result return type
 */
export type InferActionHandler<T> =
	T extends Action<infer TInput, infer TOutput>
		? (
				input: TInput extends TSchema ? Static<TInput> : undefined,
			) =>
				| Result<TOutput, EpicenterOperationError>
				| Promise<Result<TOutput, EpicenterOperationError>>
		: never;

/**
 * Type helper to check if an action is a query
 */
export function isQuery<T extends Action>(
	action: T,
): action is T & Query {
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
