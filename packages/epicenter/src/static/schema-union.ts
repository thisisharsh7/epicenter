/**
 * Standard Schema union validation utilities.
 *
 * Creates a union schema that validates against any of the provided schemas.
 * Works with any Standard Schema v1 compliant library (arktype, zod, valibot, typebox).
 */

import type { StandardSchemaV1 } from '@standard-schema/spec';

/**
 * Creates a Standard Schema that validates against a union of schemas.
 *
 * Tries each schema in order until one passes validation.
 * If none pass, returns an issue indicating no schema matched.
 *
 * @example
 * ```typescript
 * import { type } from 'arktype';
 *
 * const v1 = type({ id: 'string', title: 'string' });
 * const v2 = type({ id: 'string', title: 'string', views: 'number' });
 *
 * const union = createUnionSchema([v1, v2]);
 * const result = union['~standard'].validate({ id: '1', title: 'Hello' });
 * // result.value is { id: '1', title: 'Hello' }
 * ```
 */
export function createUnionSchema<TSchemas extends readonly StandardSchemaV1[]>(
	schemas: TSchemas,
): StandardSchemaV1<
	StandardSchemaV1.InferInput<TSchemas[number]>,
	StandardSchemaV1.InferOutput<TSchemas[number]>
> {
	return {
		'~standard': {
			version: 1,
			vendor: 'epicenter',
			validate: (value) => {
				const allIssues: StandardSchemaV1.Issue[] = [];

				for (const schema of schemas) {
					const result = schema['~standard'].validate(value);

					// If validation passes, return the result
					if (!result.issues) {
						return result;
					}

					// Collect issues for error reporting
					allIssues.push(...result.issues);
				}

				// No schema matched - return combined issues
				return {
					issues: [
						{
							message: `Value did not match any schema version. Tried ${schemas.length} version(s).`,
							path: [],
						},
						...allIssues.slice(0, 5), // Limit to first 5 issues to avoid noise
					],
				};
			},
		},
	};
}

/**
 * Validates a value against a Standard Schema and returns a normalized result.
 *
 * @example
 * ```typescript
 * const result = validateWithSchema(schema, data);
 * if (result.success) {
 *   console.log(result.value);
 * } else {
 *   console.log(result.issues);
 * }
 * ```
 */
export function validateWithSchema<TSchema extends StandardSchemaV1>(
	schema: TSchema,
	value: unknown,
):
	| { success: true; value: StandardSchemaV1.InferOutput<TSchema> }
	| { success: false; issues: readonly StandardSchemaV1.Issue[] } {
	const result = schema['~standard'].validate(value);

	if (result.issues) {
		return { success: false, issues: result.issues };
	}

	return { success: true, value: result.value as StandardSchemaV1.InferOutput<TSchema> };
}
