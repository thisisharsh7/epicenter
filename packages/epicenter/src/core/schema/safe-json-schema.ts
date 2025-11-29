import { toJsonSchema } from '@standard-community/standard-json';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { JSONSchema7 } from 'json-schema';
import { Ok, tryAsync } from 'wellcrafted/result';

/**
 * Safely convert a Standard Schema to JSON Schema with graceful error handling.
 *
 * ## Why this wrapper exists
 *
 * standard-json is a vendor-agnostic library that converts any Standard Schema
 * (zod, arktype, valibot, etc.) to JSON Schema. It detects the vendor from
 * `schema["~standard"].vendor` and delegates to the appropriate handler.
 *
 * For arktype specifically, the handler passes options directly to arktype's
 * `Type.toJsonSchema()` method. The options aren't typed in standard-json
 * (they're `Record<string, unknown>`) because each vendor has different options.
 *
 * ## Two-layer safety net
 *
 * 1. **Fallback handlers (arktype API)**: Intercept conversion issues per-node
 *    in the schema tree, allowing partial success. If a schema has 10 fields
 *    and only 1 has an unconvertible type, the other 9 are preserved.
 *
 * 2. **Outer catch**: Last-resort failsafe for truly catastrophic failures.
 *    Returns `{}` (permissive empty schema) if everything else fails.
 *
 * ## The `undefined` problem
 *
 * Arktype represents optional properties as `T | undefined` internally.
 * JSON Schema doesn't have an `undefined` type; it handles optionality via
 * the `required` array. The `unit` fallback handler strips `undefined` from
 * unions so the conversion succeeds.
 *
 * @see https://github.com/standard-community/standard-json - standard-json repo
 * @see https://arktype.io/docs/json-schema - arktype's toJsonSchema docs
 *
 * @param schema - Standard Schema to convert
 * @returns JSON Schema representation, or permissive `{}` on catastrophic error
 */
export async function safeToJsonSchema(
	schema: StandardSchemaV1,
): Promise<JSONSchema7> {
	const { data } = await tryAsync({
		try: async () =>
			// The second argument is passed through to arktype's toJsonSchema().
			// Types are loose (Record<string, unknown>) because standard-json is
			// vendor-agnostic. These options are arktype-specific.
			// See: https://arktype.io/docs/json-schema#fallback
			await toJsonSchema(schema, {
				fallback: {
					// Called when arktype encounters a "unit" type (literal value like
					// `undefined`, `null`, `true`, etc.) that can't be represented in JSON Schema.
					//
					// ctx.unit: The literal value (e.g., undefined)
					// ctx.base: The partial JSON Schema generated so far for this node
					unit: (ctx: { unit: unknown; base: JSONSchema7 }) => {
						if (ctx.unit === undefined) {
							// Return empty schema `{}` to remove undefined from the union.
							// Example: `string | undefined` becomes just `string` in the output.
							// The property's optionality is preserved via JSON Schema's `required` array.
							return {};
						}
						// For other unit types (null, true, etc.), keep whatever was generated
						return ctx.base;
					},
					// Catch-all for any other incompatible arktype features (morphs,
					// predicates, symbolic keys, etc.). Preserves partial schema.
					default: (ctx: { base: JSONSchema7 }) => ctx.base,
				},
			}),
		// Last-resort fallback: if the entire conversion throws (shouldn't happen
		// with the fallback handlers above, but defensive coding), return a
		// permissive empty schema `{}` that accepts any input.
		catch: (e) => {
			console.warn('Failed to convert schema, using permissive fallback:', e);
			return Ok({} satisfies JSONSchema7);
		},
	});
	return data;
}
