import type { StandardSchemaV1 } from '@standard-schema/spec';
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
	TOutput = unknown,
	TInput extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
> = Query<TOutput, TInput> | Mutation<TOutput, TInput>;

/**
 * Query action - read operation with no side effects
 */
export type Query<
	TOutput = unknown,
	TInput extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
> = {
	// Callable signature - no parameter when TInput is undefined, required parameter when TInput is StandardSchemaV1
	(
		...args: TInput extends StandardSchemaV1
			? [input: StandardSchemaV1.InferOutput<TInput>]
			: []
	):
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
	TOutput = unknown,
	TInput extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
> = {
	// Callable signature - no parameter when TInput is undefined, required parameter when TInput is StandardSchemaV1
	(
		...args: TInput extends StandardSchemaV1
			? [input: StandardSchemaV1.InferOutput<TInput>]
			: []
	):
		| Result<TOutput, EpicenterOperationError>
		| Promise<Result<TOutput, EpicenterOperationError>>;
	// Metadata properties
	type: 'mutation';
	input?: TInput;
	description?: string;
};

/**
 * Helper function to define a query action with input schema
 * Returns a callable function with metadata properties attached
 */
export function defineQuery<TOutput, TInput extends StandardSchemaV1>(config: {
	input: TInput;
	handler: (
		input: StandardSchemaV1.InferOutput<NoInfer<TInput>>,
	) =>
		| Result<TOutput, EpicenterOperationError>
		| Promise<Result<TOutput, EpicenterOperationError>>;
	description?: string;
}): Query<TOutput, TInput>;

/**
 * Helper function to define a query action without input
 * Returns a callable function with metadata properties attached
 */
export function defineQuery<TOutput>(config: {
	handler: () =>
		| Result<TOutput, EpicenterOperationError>
		| Promise<Result<TOutput, EpicenterOperationError>>;
	description?: string;
}): Query<TOutput, undefined>;

/**
 * Implementation for defineQuery
 */
export function defineQuery(config: any): any {
	return Object.assign(config.handler, {
		type: 'query' as const,
		input: config.input,
		description: config.description,
	});
}

/**
 * Helper function to define a mutation action with input schema
 * Returns a callable function with metadata properties attached
 */
export function defineMutation<TOutput, TInput extends StandardSchemaV1>(config: {
	input: TInput;
	handler: (
		input: StandardSchemaV1.InferOutput<NoInfer<TInput>>,
	) =>
		| Result<TOutput, EpicenterOperationError>
		| Promise<Result<TOutput, EpicenterOperationError>>;
	description?: string;
}): Mutation<TOutput, TInput>;

/**
 * Helper function to define a mutation action without input
 * Returns a callable function with metadata properties attached
 */
export function defineMutation<TOutput>(config: {
	handler: () =>
		| Result<TOutput, EpicenterOperationError>
		| Promise<Result<TOutput, EpicenterOperationError>>;
	description?: string;
}): Mutation<TOutput, undefined>;

/**
 * Implementation for defineMutation
 */
export function defineMutation(config: any): any {
	return Object.assign(config.handler, {
		type: 'mutation' as const,
		input: config.input,
		description: config.description,
	});
}

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
