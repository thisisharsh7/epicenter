import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Argv } from 'yargs';

/**
 * Schema converter for converting StandardSchema to yargs options
 * Each converter knows how to introspect a specific schema library
 */
export type SchemaConverter = {
	/**
	 * Check if this converter can handle the given schema
	 * @param schema - The schema to check
	 * @returns true if this converter can handle the schema
	 */
	condition: (schema: StandardSchemaV1 | undefined) => boolean;

	/**
	 * Convert the schema to yargs options
	 * @param schema - The schema to convert
	 * @param yargs - The yargs instance to add options to
	 * @returns The modified yargs instance
	 */
	convert: (schema: StandardSchemaV1, yargs: Argv) => Argv;
};

/**
 * Create a schema converter with options
 * @param options - Converter options containing condition and convert functions
 * @returns A schema converter instance
 */
export function createSchemaConverter(options: {
	condition: (schema: StandardSchemaV1 | undefined) => boolean;
	convert: (schema: StandardSchemaV1, yargs: Argv) => Argv;
}): SchemaConverter {
	return {
		condition: options.condition,
		convert: options.convert,
	};
}

/**
 * Apply schema converters to generate yargs options
 * Tries each converter in order until one matches
 *
 * @param schema - The schema to convert
 * @param yargs - The yargs instance to add options to
 * @param converters - Array of schema converters to try
 * @returns The modified yargs instance
 */
export function applySchemaConverters(
	schema: StandardSchemaV1 | undefined,
	yargs: Argv,
	converters: SchemaConverter[],
): Argv {
	if (!schema) {
		return yargs;
	}

	for (const converter of converters) {
		if (converter.condition(schema)) {
			return converter.convert(schema, yargs);
		}
	}

	// No converter matched - schema type not supported
	console.warn(
		'Warning: No schema converter found for this schema type. CLI flags will not be generated.',
	);
	return yargs;
}
