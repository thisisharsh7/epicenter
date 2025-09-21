/**
 * Helper functions for defining plugin methods with proper typing and discrimination
 */

import type { StandardSchemaV1 } from '@standard-schema/spec';

/**
 * A collection of plugin methods indexed by method name
 */
export type PluginMethodMap = Record<string, PluginMethod>;

/**
 * Union type for all method types
 */
export type PluginMethod<
	TSchema extends StandardSchemaV1 = StandardSchemaV1,
	TOutput = unknown,
> = QueryMethod<TSchema, TOutput> | MutationMethod<TSchema, TOutput>;

/**
 * Query method structure with schema validation
 */
export type QueryMethod<
	TSchema extends StandardSchemaV1 = StandardSchemaV1,
	TOutput = unknown,
> = {
	type: 'query';
	input: TSchema;
	handler: (
		input: StandardSchemaV1.InferOutput<TSchema>,
	) => TOutput | Promise<TOutput>;
	description?: string;
};

/**
 * Mutation method structure with schema validation
 */
export type MutationMethod<
	TSchema extends StandardSchemaV1 = StandardSchemaV1,
	TOutput = unknown,
> = {
	type: 'mutation';
	input: TSchema;
	handler: (
		input: StandardSchemaV1.InferOutput<TSchema>,
	) => TOutput | Promise<TOutput>;
	description?: string;
};

/**
 * Helper function to define a query method
 * Pass-through function that adds type discrimination
 */
export function defineQuery<TSchema extends StandardSchemaV1, TOutput>(
	config: Omit<QueryMethod<TSchema, TOutput>, 'type'>,
): QueryMethod<TSchema, TOutput> {
	return { type: 'query' as const, ...config };
}

/**
 * Helper function to define a mutation method
 * Pass-through function that adds type discrimination
 */
export function defineMutation<TSchema extends StandardSchemaV1, TOutput>(
	config: Omit<MutationMethod<TSchema, TOutput>, 'type'>,
): MutationMethod<TSchema, TOutput> {
	return { type: 'mutation' as const, ...config };
}

/**
 * Type helper to extract the input type from a method
 */
export type InferMethodInput<T> = T extends PluginMethod<infer TSchema, unknown>
	? StandardSchemaV1.InferOutput<TSchema>
	: never;

/**
 * Type helper to extract the output type from a method
 */
export type InferMethodOutput<T> = T extends PluginMethod<
	StandardSchemaV1,
	infer O
>
	? O
	: never;

/**
 * Type helper to check if a method is a query
 */
export function isQuery<T extends PluginMethod>(
	method: T,
): method is T & QueryMethod {
	return method.type === 'query';
}

/**
 * Type helper to check if a method is a mutation
 */
export function isMutation<T extends PluginMethod>(
	method: T,
): method is T & MutationMethod {
	return method.type === 'mutation';
}
