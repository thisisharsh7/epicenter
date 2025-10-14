import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Argv } from 'yargs';
import { z } from 'zod';
import { createSchemaConverter } from '../schema-converters';

/**
 * Create a Zod schema converter
 * Converts Zod object schemas to yargs options by introspecting the schema structure
 */
export function createZodConverter() {
	return createSchemaConverter({
		condition: (schema) => {
			if (!schema) return false;
			// Check if this is a Zod schema by looking for Zod-specific properties
			const zodSchema = schema as any;
			return !!(
				zodSchema instanceof z.ZodType ||
				(zodSchema._def && typeof zodSchema._def === 'object')
			);
		},

		convert: (schema, yargs) => {
			const zodSchema = schema as unknown as z.ZodTypeAny;

			// Only handle ZodObject schemas for CLI flags
			if (zodSchema instanceof z.ZodObject) {
				const shape = zodSchema.shape as Record<string, z.ZodTypeAny>;

				for (const [key, fieldSchema] of Object.entries(shape)) {
					addZodFieldToYargs(key, fieldSchema, yargs);
				}
			}

			return yargs;
		},
	});
}

/**
 * Add a single Zod field to yargs as an option
 */
function addZodFieldToYargs(key: string, fieldSchema: z.ZodTypeAny, yargs: Argv): void {
	// Unwrap optional and default schemas
	let unwrapped = fieldSchema;
	let isOptional = false;
	let defaultValue: any = undefined;
	let description: string | undefined;

	// Unwrap ZodOptional
	if (unwrapped instanceof z.ZodOptional) {
		isOptional = true;
		unwrapped = unwrapped._def.innerType;
	}

	// Unwrap ZodDefault
	if (unwrapped instanceof z.ZodDefault) {
		defaultValue = unwrapped._def.defaultValue();
		unwrapped = unwrapped._def.innerType;
	}

	// Get description if available
	if ('description' in unwrapped._def && typeof unwrapped._def.description === 'string') {
		description = unwrapped._def.description;
	}

	// Determine the yargs option type
	if (unwrapped instanceof z.ZodString) {
		yargs.option(key, {
			type: 'string',
			description,
			default: defaultValue,
			demandOption: !isOptional && defaultValue === undefined,
		});
	} else if (unwrapped instanceof z.ZodNumber) {
		yargs.option(key, {
			type: 'number',
			description,
			default: defaultValue,
			demandOption: !isOptional && defaultValue === undefined,
		});
	} else if (unwrapped instanceof z.ZodBoolean) {
		yargs.option(key, {
			type: 'boolean',
			description,
			default: defaultValue,
			demandOption: !isOptional && defaultValue === undefined,
		});
	} else if (unwrapped instanceof z.ZodArray) {
		// Handle arrays
		yargs.option(key, {
			type: 'array',
			description,
			default: defaultValue,
			demandOption: !isOptional && defaultValue === undefined,
		});
	} else if (unwrapped instanceof z.ZodEnum) {
		// Handle enums
		const values = unwrapped._def.values;
		yargs.option(key, {
			type: 'string',
			description,
			choices: values,
			default: defaultValue,
			demandOption: !isOptional && defaultValue === undefined,
		});
	} else {
		// For unsupported types, just add as a string option
		yargs.option(key, {
			type: 'string',
			description: description || `${key} (complex type)`,
			default: defaultValue,
			demandOption: !isOptional && defaultValue === undefined,
		});
	}
}
