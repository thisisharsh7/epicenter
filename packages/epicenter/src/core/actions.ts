import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Result } from 'wellcrafted/result';
import type { EpicenterOperationError } from './errors';

/**
 * A collection of workspace actions indexed by action name.
 *
 * Each workspace exposes its functionality through a set of typed actions
 * that can be called by other workspaces or external consumers.
 */
export type WorkspaceActionMap = Record<string, WorkspaceAction>;

/**
 * Union type for all action types
 */
export type WorkspaceAction<
	TSchema extends StandardSchemaV1 = StandardSchemaV1,
	TOutput = unknown,
> = QueryAction<TSchema, TOutput> | MutationAction<TSchema, TOutput>;

/**
 * Query action structure with schema validation
 */
export type QueryAction<
	TSchema extends StandardSchemaV1 = StandardSchemaV1,
	TOutput = unknown,
> = {
	type: 'query';
	input: TSchema;
	handler: (
		input: StandardSchemaV1.InferOutput<TSchema>,
	) =>
		| Result<TOutput, EpicenterOperationError>
		| Promise<Result<TOutput, EpicenterOperationError>>;
	description?: string;
};

/**
 * Mutation action structure with schema validation
 */
export type MutationAction<
	TSchema extends StandardSchemaV1 = StandardSchemaV1,
	TOutput = unknown,
> = {
	type: 'mutation';
	input: TSchema;
	handler: (
		input: StandardSchemaV1.InferOutput<TSchema>,
	) =>
		| Result<TOutput, EpicenterOperationError>
		| Promise<Result<TOutput, EpicenterOperationError>>;
	description?: string;
};

/**
 * Helper function to define a query action
 * Pass-through function that adds type discrimination
 */
export function defineQuery<TSchema extends StandardSchemaV1, TOutput>(
	config: Omit<QueryAction<TSchema, TOutput>, 'type'>,
): QueryAction<TSchema, TOutput> {
	return { type: 'query' as const, ...config };
}

/**
 * Helper function to define a mutation action
 * Pass-through function that adds type discrimination
 */
export function defineMutation<TSchema extends StandardSchemaV1, TOutput>(
	config: Omit<MutationAction<TSchema, TOutput>, 'type'>,
): MutationAction<TSchema, TOutput> {
	return { type: 'mutation' as const, ...config };
}

/**
 * Type helper to extract the input type from an action
 */
export type InferActionInput<T> = T extends WorkspaceAction<
	infer TSchema,
	unknown
>
	? StandardSchemaV1.InferOutput<TSchema>
	: never;

/**
 * Type helper to extract the output type from an action
 */
export type InferActionOutput<T> = T extends WorkspaceAction<
	StandardSchemaV1,
	infer O
>
	? O
	: never;

/**
 * Type helper to extract the unwrapped output type from an action handler
 * This unwraps the Result type to get the actual success value type
 */
export type InferActionOutputUnwrapped<T> = T extends WorkspaceAction<
	StandardSchemaV1,
	infer O
>
	? O
	: never;

/**
 * Type helper to extract the handler function with Result return type
 */
export type InferActionHandler<T> = T extends WorkspaceAction<
	infer TSchema,
	infer TOutput
>
	? (
			input: StandardSchemaV1.InferOutput<TSchema>,
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
