import type { TSchema } from 'typebox';
import type { Argv } from 'yargs';

/**
 * Convert a TypeBox schema to yargs CLI options
 *
 * @param schema - TypeBox schema (typically from Type.Script())
 * @param yargs - Yargs instance to add options to
 * @returns Modified yargs instance with options added
 */
export function typeboxToYargs(schema: TSchema | undefined, yargs: Argv): Argv {
	if (!schema) return yargs;

	const typeboxSchema = schema as any;

	// Type.Script() generates Object schemas
	if (typeboxSchema['~kind'] === 'Object' && typeboxSchema.properties) {
		for (const [key, propSchema] of Object.entries(typeboxSchema.properties)) {
			addFieldToYargs(key, propSchema as any, yargs);
		}
	}

	return yargs;
}

/**
 * Add a single TypeBox field to yargs as an option
 */
function addFieldToYargs(key: string, fieldSchema: any, yargs: Argv): void {
	const kind = fieldSchema['~kind'];
	const isOptional = fieldSchema.modifier === 'Optional';
	const description = fieldSchema.description;

	switch (kind) {
		case 'String':
			yargs.option(key, {
				type: 'string',
				description,
				demandOption: !isOptional,
			});
			break;

		case 'Number':
		case 'Integer':
			yargs.option(key, {
				type: 'number',
				description,
				demandOption: !isOptional,
			});
			break;

		case 'Boolean':
			yargs.option(key, {
				type: 'boolean',
				description,
				demandOption: !isOptional,
			});
			break;

		case 'Array':
			yargs.option(key, {
				type: 'array',
				description,
				demandOption: !isOptional,
			});
			break;

		case 'Union':
			// Handle enums (union of literals from Type.Script)
			if (fieldSchema.anyOf?.every((s: any) => s['~kind'] === 'Literal')) {
				const choices = fieldSchema.anyOf.map((s: any) => s.const);
				yargs.option(key, {
					type: 'string',
					choices,
					description,
					demandOption: !isOptional,
				});
			}
			break;
	}
}
