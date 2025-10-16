import type { TSchema, Static } from 'typebox';
import type { Result } from 'wellcrafted/result';
import type { EpicenterOperationError } from './errors';

/**
 * A collection of workspace actions indexed by action name.
 *
 * Each workspace exposes its functionality through a set of typed actions
 * that can be called by other workspaces or external consumers.
 */
export type WorkspaceActionMap = Record<string, WorkspaceAction<any, any>>;

/**
 * Union type for all action types
 */
export type WorkspaceAction<
	TInput extends TSchema = TSchema,
	TOutput = unknown,
> = QueryAction<TInput, TOutput> | MutationAction<TInput, TOutput>;

/**
 * Base action type - callable function with metadata properties
 * Unified for both queries and mutations
 */
export type Action<
	TType extends 'query' | 'mutation',
	TInput extends TSchema | undefined = TSchema | undefined,
	TOutput = unknown,
> = {
	// Callable signature - properly infers input based on whether TInput is TSchema or undefined
	(input: TInput extends TSchema ? Static<TInput> : undefined):
		| Result<TOutput, EpicenterOperationError>
		| Promise<Result<TOutput, EpicenterOperationError>>;
	// Metadata properties
	type: TType;
	input?: TInput;
	description?: string;
};

/**
 * Query action - specialization of Action with type='query'
 */
export type QueryAction<
	TInput extends TSchema | undefined = TSchema | undefined,
	TOutput = unknown,
> = Action<'query', TInput, TOutput>;

/**
 * Mutation action - specialization of Action with type='mutation'
 */
export type MutationAction<
	TInput extends TSchema | undefined = TSchema | undefined,
	TOutput = unknown,
> = Action<'mutation', TInput, TOutput>;

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
}): QueryAction<TInput, TOutput> {
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
}): MutationAction<TInput, TOutput> {
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
	T extends WorkspaceAction<infer TInput, unknown>
		? Static<TInput>
		: never;

/**
 * Type helper to extract the output type from an action
 */
export type InferActionOutput<T> =
	T extends WorkspaceAction<TSchema, infer O> ? O : never;

/**
 * Type helper to extract the unwrapped output type from an action handler
 * This unwraps the Result type to get the actual success value type
 */
export type InferActionOutputUnwrapped<T> =
	T extends WorkspaceAction<TSchema, infer O> ? O : never;

/**
 * Type helper to extract the handler function with Result return type
 */
export type InferActionHandler<T> =
	T extends WorkspaceAction<infer TInput, infer TOutput>
		? (
				input: Static<TInput>,
			) =>
				| Result<TOutput, EpicenterOperationError>
				| Promise<Result<TOutput, EpicenterOperationError>>
		: never;

/**
 * Type helper to check if an action is a query
 */
export function isQuery<T extends WorkspaceAction>(
	action: T,
): action is T & QueryAction {
	return action.type === 'query';
}

/**
 * Type helper to check if an action is a mutation
 */
export function isMutation<T extends WorkspaceAction>(
	action: T,
): action is T & MutationAction {
	return action.type === 'mutation';
}
