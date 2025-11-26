import { toJsonSchema } from '@standard-community/standard-json';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { JSONSchema7 } from 'json-schema';
import { Ok, tryAsync } from 'wellcrafted/result';

/**
 * Safely convert a Standard Schema to JSON Schema with graceful error handling.
 *
 * If conversion fails, returns a permissive empty JSON schema that accepts any input.
 * This ensures tools remain functional even if schema conversion encounters errors.
 *
 * @param schema - Standard Schema to convert
 * @returns JSON Schema representation, or permissive fallback on error
 */
export async function safeToJsonSchema(
	schema: StandardSchemaV1,
): Promise<JSONSchema7> {
	const { data } = await tryAsync({
		try: async () => await toJsonSchema(schema),
		catch: (e) => {
			console.warn('Failed to convert schema, using permissive fallback:', e);
			return Ok({} satisfies JSONSchema7);
		},
	});
	return data;
}
