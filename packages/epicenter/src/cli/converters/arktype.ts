import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Argv } from 'yargs';
import { createSchemaConverter } from '../schema-converters';

/**
 * Create an Arktype schema converter
 * Converts Arktype object schemas to yargs options by introspecting the schema structure
 *
 * Note: Arktype introspection is more complex than Zod due to its internal type system.
 * This implementation provides basic support for object schemas and may need to be extended
 * for more complex Arktype features (unions, morphs, intersections, etc.)
 */
export function createArktypeConverter() {
	return createSchemaConverter({
		condition: (schema) => {
			if (!schema) return false;
			// Check if this is an Arktype schema
			// Arktype types have a `.json` property for introspection
			const arktypeSchema = schema as any;
			return (
				arktypeSchema.json !== undefined &&
				typeof arktypeSchema.get === 'function' &&
				arktypeSchema.expression !== undefined
			);
		},

		convert: (schema, yargs) => {
			const arktypeSchema = schema as any;

			// Try to introspect the schema using Arktype's .json property
			// Note: .json is not typed, so we need to work with it carefully
			try {
				const jsonRepresentation = arktypeSchema.json;

				// For object types, we need to iterate over properties
				// This is a simplified implementation that handles basic object schemas
				if (jsonRepresentation && typeof jsonRepresentation === 'object') {
					// Check if this is an object type with properties
					if (jsonRepresentation.kind === 'object' || jsonRepresentation.domain === 'object') {
						const props = jsonRepresentation.props || jsonRepresentation.properties || {};

						for (const [key, propDef] of Object.entries(props)) {
							addArktypeFieldToYargs(key, propDef as any, yargs);
						}
					}
				}
			} catch (error) {
				console.warn('Failed to introspect Arktype schema:', error);
			}

			return yargs;
		},
	});
}

/**
 * Add a single Arktype field to yargs as an option
 * This is a simplified implementation that handles basic types
 */
function addArktypeFieldToYargs(key: string, propDef: any, yargs: Argv): void {
	let isOptional = propDef.optional === true;
	let defaultValue: any = propDef.default;
	let description: string | undefined = propDef.description;

	// Determine the type from the property definition
	const propType = propDef.kind || propDef.domain || propDef.type;

	// Map Arktype types to yargs option types
	if (propType === 'string' || propType === 'primitive' && propDef.value === 'string') {
		yargs.option(key, {
			type: 'string',
			description,
			default: defaultValue,
			demandOption: !isOptional && defaultValue === undefined,
		});
	} else if (propType === 'number' || propType === 'primitive' && propDef.value === 'number') {
		yargs.option(key, {
			type: 'number',
			description,
			default: defaultValue,
			demandOption: !isOptional && defaultValue === undefined,
		});
	} else if (propType === 'boolean' || propType === 'primitive' && propDef.value === 'boolean') {
		yargs.option(key, {
			type: 'boolean',
			description,
			default: defaultValue,
			demandOption: !isOptional && defaultValue === undefined,
		});
	} else if (propType === 'array') {
		yargs.option(key, {
			type: 'array',
			description,
			default: defaultValue,
			demandOption: !isOptional && defaultValue === undefined,
		});
	} else if (propDef.enum || propDef.unit) {
		// Handle enum/unit types
		const choices = propDef.enum || propDef.unit;
		yargs.option(key, {
			type: 'string',
			description,
			choices: Array.isArray(choices) ? choices : undefined,
			default: defaultValue,
			demandOption: !isOptional && defaultValue === undefined,
		});
	} else {
		// For unsupported or complex types, add as string option
		yargs.option(key, {
			type: 'string',
			description: description || `${key} (complex type: ${propType})`,
			default: defaultValue,
			demandOption: !isOptional && defaultValue === undefined,
		});
	}
}
