import type {
	StandardJSONSchemaV1,
	StandardSchemaV1,
} from '@standard-schema/spec';

/**
 * Combined props for schemas that implement both StandardSchema and StandardJSONSchema.
 *
 * StandardSchemaV1 and StandardJSONSchemaV1 are orthogonal specs:
 * - StandardSchemaV1: Provides validation via `~standard.validate()`
 * - StandardJSONSchemaV1: Provides JSON Schema conversion via `~standard.jsonSchema`
 *
 * @see https://standardschema.dev/json-schema#what-if-i-want-to-accept-only-schemas-that-implement-both-standardschema-and-standardjsonschema
 */
type StandardSchemaWithJSONSchemaProps<
	TInput = unknown,
	TOutput = TInput,
> = StandardSchemaV1.Props<TInput, TOutput> &
	StandardJSONSchemaV1.Props<TInput, TOutput>;

/**
 * Schema type that implements both StandardSchema (validation) and StandardJSONSchema (conversion).
 *
 * Use this as a constraint when you need:
 * 1. Runtime validation via `~standard.validate()`
 * 2. JSON Schema generation via `~standard.jsonSchema.input()`
 *
 * ArkType, Zod (v4.2+), and Valibot (with adapter) all implement both specs.
 *
 * @example
 * ```typescript
 * // ArkType
 * import { type } from 'arktype';
 * type('string') satisfies StandardSchemaWithJSONSchema; // ✅
 *
 * // Zod (v4.2+)
 * import * as z from 'zod';
 * z.string() satisfies StandardSchemaWithJSONSchema; // ✅
 * ```
 */
export type StandardSchemaWithJSONSchema<TInput = unknown, TOutput = TInput> = {
	'~standard': StandardSchemaWithJSONSchemaProps<TInput, TOutput>;
};
