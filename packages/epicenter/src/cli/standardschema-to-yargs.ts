import { toJsonSchema } from '@standard-community/standard-json';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { JSONSchema7, JSONSchema7Definition, JSONSchema7TypeName } from 'json-schema';
import type { Argv } from 'yargs';

/**
 * Convert a Standard Schema to yargs CLI options
 *
 * This function converts Standard Schema (used by ArkType, Zod, Valibot, etc.)
 * to yargs CLI options by first converting to JSON Schema, then introspecting
 * the JSON Schema structure.
 *
 * @param schema - Standard Schema V1 instance
 * @param yargs - Yargs instance to add options to
 * @returns Modified yargs instance with options added
 *
 * @example
 * ```typescript
 * import { type } from 'arktype';
 * import yargs from 'yargs';
 * import { standardSchemaToYargs } from './standardschema-to-yargs';
 *
 * const schema = type({
 *   name: "string",
 *   age: "number",
 *   active: "boolean?"
 * });
 *
 * const cli = await standardSchemaToYargs(schema, yargs);
 * ```
 */
export async function standardSchemaToYargs(
	schema: StandardSchemaV1 | undefined,
	yargs: Argv,
): Promise<Argv> {
	if (!schema) return yargs;

	// Convert Standard Schema to JSON Schema
	const jsonSchema = await toJsonSchema(schema);

	// JSON Schema should be an object type with properties
	if (jsonSchema.type === 'object' && jsonSchema.properties) {
		const required = new Set((jsonSchema.required) ?? []);

		for (const [key, fieldSchema] of Object.entries(jsonSchema.properties)) {
			const isRequired = required.has(key);
			addFieldToYargs({ key, fieldSchema, isRequired, yargs });
		}
	}

	return yargs;
}


/**
 * Add a single JSON Schema field to yargs as an option
 */
function addFieldToYargs({ key, fieldSchema, isRequired, yargs }: {
	key: string;
	fieldSchema: JSONSchema7Definition;
	isRequired: boolean;
	yargs: Argv;
}): void {

	// JSONSchema7 properties can be boolean or JSONSchema7Definition
	// We only handle object schemas, not boolean schemas (which accept anything)
	if (typeof fieldSchema === 'boolean') return;

	// Handle explicit enum property
	if (fieldSchema.enum) {
		const choices = fieldSchema.enum.filter(
			(v): v is string | number => typeof v === 'string' || typeof v === 'number',
		);
		if (choices.length > 0) {
			yargs.option(key, {
				type: typeof choices[0] === 'number' ? 'number' : 'string',
				choices,
				description: fieldSchema.description,
				demandOption: isRequired,
			});
			return;
		}
	}

	// Handle union types (anyOf, oneOf)
	if (fieldSchema.anyOf || fieldSchema.oneOf) {
		const variants = (fieldSchema.anyOf || fieldSchema.oneOf) as JSONSchema7[];

		// Check if it's a union of string literals (const values)
		const stringLiterals = variants
			.filter((v): v is JSONSchema7 => typeof v !== 'boolean' && v.const !== undefined)
			.map((v) => v.const)
			.filter((c): c is string => typeof c === 'string');

		if (stringLiterals.length === variants.length && stringLiterals.length > 0) {
			yargs.option(key, {
				type: 'string',
				choices: stringLiterals,
				description: fieldSchema.description,
				demandOption: isRequired,
			});
			return;
		}

		// For other unions, fall back to the first type
		const firstVariant = variants[0];
		if (firstVariant && typeof firstVariant !== 'boolean' && firstVariant.type) {
			const firstType = Array.isArray(firstVariant.type)
				? firstVariant.type[0]
				: firstVariant.type;
			if (firstType) {
				addFieldByType({ key, type: firstType, description: fieldSchema.description, isRequired, yargs });
			}
		}
		return;
	}

	// Handle standard types
	if (fieldSchema.type) {
		// JSONSchema7TypeName can be a string or array of strings
		const primaryType = Array.isArray(fieldSchema.type) ? fieldSchema.type[0] : fieldSchema.type;
		if (primaryType) {
			addFieldByType({ key, type: primaryType, description: fieldSchema.description, isRequired, yargs });
		}
	}
}


/**
 * Add a field to yargs based on JSON Schema type
 */
function addFieldByType({ key, type, description, isRequired, yargs }: {
	key: string;
	type: JSONSchema7TypeName;
	description: string | undefined;
	isRequired: boolean;
	yargs: Argv;
}): void {

	switch (type) {
		case 'string':
			yargs.option(key, {
				type: 'string',
				description,
				demandOption: isRequired,
			});
			break;

		case 'number':
		case 'integer':
			yargs.option(key, {
				type: 'number',
				description,
				demandOption: isRequired,
			});
			break;

		case 'boolean':
			yargs.option(key, {
				type: 'boolean',
				description,
				demandOption: isRequired,
			});
			break;

		case 'array':
			yargs.option(key, {
				type: 'array',
				description,
				demandOption: isRequired,
			});
			break;

		case 'null':
		case 'object':
			// Skip null and object types - not supported as CLI options
			break;
	}
}
