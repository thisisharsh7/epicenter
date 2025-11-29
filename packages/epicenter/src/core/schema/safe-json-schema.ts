import { toJsonSchema } from '@standard-community/standard-json';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { JSONSchema7 } from 'json-schema';
import { Ok, tryAsync } from 'wellcrafted/result';

/**
 * Safely convert a Standard Schema to JSON Schema with graceful error handling.
 *
 * Handles arktype-specific edge cases:
 * - `undefined` in unions (optional properties become `T | undefined` internally)
 * - Other unit types that can't be represented in JSON Schema
 *
 * If conversion still fails after fallback handling, returns a permissive empty
 * JSON schema that accepts any input. This ensures tools remain functional.
 *
 * @param schema - Standard Schema to convert
 * @returns JSON Schema representation, or permissive fallback on error
 */
export async function safeToJsonSchema(
	schema: StandardSchemaV1,
): Promise<JSONSchema7> {
	const { data } = await tryAsync({
		try: async () =>
			await toJsonSchema(schema, {
				// Handle arktype types that don't have JSON Schema equivalents
				fallback: {
					// Handle `undefined` in unions (e.g., optional properties: `string | undefined`)
					// We ignore undefined since JSON Schema handles optionality via `required` array
					unit: (ctx: { unit: unknown; base: JSONSchema7 }) => {
						if (ctx.unit === undefined) {
							// Return empty schema to effectively remove undefined from the union
							// The property will still be marked as optional via the `required` array
							return {};
						}
						// For other unit types, preserve the base schema
						return ctx.base;
					},
					// Fallback for any other incompatible types
					default: (ctx: { base: JSONSchema7 }) => ctx.base,
				},
			}),
		catch: (e) => {
			console.warn('Failed to convert schema, using permissive fallback:', e);
			return Ok({} satisfies JSONSchema7);
		},
	});
	return data;
}
