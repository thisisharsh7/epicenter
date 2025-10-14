import { z } from 'zod';
import type {
	TableSchema,
	ColumnSchema,
	SelectColumnSchema,
	MultiSelectColumnSchema,
	TextColumnSchema,
	IntegerColumnSchema,
	RealColumnSchema,
	BooleanColumnSchema,
	DateColumnSchema,
	YtextColumnSchema,
	YxmlfragmentColumnSchema,
	IdColumnSchema,
} from '../core/schema';

/**
 * Maps a ColumnSchema to its Zod type equivalent
 */
type ColumnSchemaToZod<C extends ColumnSchema> = C extends IdColumnSchema
	? z.ZodString
	: C extends TextColumnSchema<infer TNullable>
		? TNullable extends true
			? z.ZodNullable<z.ZodString>
			: z.ZodString
		: C extends IntegerColumnSchema<infer TNullable>
			? TNullable extends true
				? z.ZodNullable<z.ZodNumber>
				: z.ZodNumber
			: C extends RealColumnSchema<infer TNullable>
				? TNullable extends true
					? z.ZodNullable<z.ZodNumber>
					: z.ZodNumber
				: C extends BooleanColumnSchema<infer TNullable>
					? TNullable extends true
						? z.ZodNullable<z.ZodBoolean>
						: z.ZodBoolean
					: C extends DateColumnSchema<infer TNullable>
						? TNullable extends true
							? z.ZodNullable<
									z.ZodObject<{
										date: z.ZodDate;
										timezone: z.ZodString;
									}>
								>
							: z.ZodObject<{
									date: z.ZodDate;
									timezone: z.ZodString;
								}>
						: C extends SelectColumnSchema<infer TOptions, infer TNullable>
							? TNullable extends true
								? z.ZodNullable<z.ZodEnum<[TOptions[number], ...TOptions[number][]]>>
								: z.ZodEnum<[TOptions[number], ...TOptions[number][]]>
							: C extends MultiSelectColumnSchema<infer TOptions, infer TNullable>
								? TNullable extends true
									? z.ZodNullable<
											z.ZodArray<z.ZodEnum<[TOptions[number], ...TOptions[number][]]>>
										>
									: z.ZodArray<z.ZodEnum<[TOptions[number], ...TOptions[number][]]>>
								: C extends YtextColumnSchema
									? z.ZodAny
									: C extends YxmlfragmentColumnSchema
										? z.ZodAny
										: z.ZodAny;

/**
 * Creates a Zod schema for inserting data into a table.
 * - Omits the `id` field (auto-generated)
 * - Fields with defaults are optional
 * - Handles nullable fields
 *
 * @param schema - The table schema to generate from
 *
 * @example
 * const insertSchema = createInsertSchema(db.schema.pages);
 * // Type: z.ZodObject<{ title: z.ZodString, content: z.ZodNullable<z.ZodString>, ... }>
 */
export function createInsertSchema<TTableSchema extends TableSchema>(
	schema: TTableSchema,
) {
	const zodShape = Object.fromEntries(
		Object.entries(schema)
			.filter(([fieldName]) => fieldName !== 'id')
			.map(([fieldName, columnSchema]) => {
				let fieldSchema: any = columnToZod(columnSchema);

				// Handle nullable - make it optional AND nullable (can be omitted or null)
				if ('nullable' in columnSchema && columnSchema.nullable) {
					fieldSchema = fieldSchema.nullish();
				}

				// Handle defaults (make field optional)
				if ('default' in columnSchema && columnSchema.default !== undefined) {
					fieldSchema = fieldSchema.optional();
				}

				return [fieldName, fieldSchema];
			}),
	);

	return z.object(zodShape) as z.ZodObject<any>;
}

/**
 * Creates a Zod schema for selecting/reading data from a table.
 * - Includes all fields (including id)
 * - Useful for validating query results
 *
 * @param schema - The table schema to generate from
 *
 * @example
 * const selectSchema = createSelectSchema(db.schema.pages);
 */
export function createSelectSchema<TTableSchema extends TableSchema>(
	schema: TTableSchema,
) {
	const zodShape = Object.fromEntries(
		Object.entries(schema).map(([fieldName, columnSchema]) => {
			let fieldSchema: any = columnToZod(columnSchema);

			// Handle nullable
			if ('nullable' in columnSchema && columnSchema.nullable) {
				fieldSchema = fieldSchema.nullable();
			}

			return [fieldName, fieldSchema];
		}),
	);

	return z.object(zodShape) as z.ZodObject<any>;
}

/**
 * Creates a Zod schema for updating data in a table.
 * - `id` field is required
 * - All other fields are optional (partial update)
 *
 * @param schema - The table schema to generate from
 *
 * @example
 * const updateSchema = createUpdateSchema(db.schema.pages);
 */
export function createUpdateSchema<TTableSchema extends TableSchema>(
	schema: TTableSchema,
) {
	const zodShape = Object.fromEntries(
		Object.entries(schema).map(([fieldName, columnSchema]) => {
			// id is required
			if (fieldName === 'id') {
				return [fieldName, z.string()];
			}

			let fieldSchema: any = columnToZod(columnSchema);

			// Handle nullable
			if ('nullable' in columnSchema && columnSchema.nullable) {
				fieldSchema = fieldSchema.nullable();
			}

			// Make all fields optional (partial update)
			fieldSchema = fieldSchema.optional();

			return [fieldName, fieldSchema];
		}),
	);

	return z.object(zodShape) as z.ZodObject<any>;
}

/**
 * Converts a single column schema to its Zod equivalent
 */
function columnToZod<C extends ColumnSchema>(
	columnSchema: C,
): ColumnSchemaToZod<C> {
	switch (columnSchema.type) {
		case 'id':
		case 'text':
			return z.string() as ColumnSchemaToZod<C>;

		case 'integer':
			return z.number().int() as ColumnSchemaToZod<C>;

		case 'real':
			return z.number() as ColumnSchemaToZod<C>;

		case 'boolean':
			return z.boolean() as ColumnSchemaToZod<C>;

		case 'date':
			return z.object({
				date: z.date(),
				timezone: z.string(),
			}) as ColumnSchemaToZod<C>;

		case 'select': {
			const selectSchema = columnSchema as SelectColumnSchema;
			if (selectSchema.options.length === 0) {
				throw new Error('Select column must have at least one option');
			}
			return z.enum(
				selectSchema.options as [string, ...string[]],
			) as ColumnSchemaToZod<C>;
		}

		case 'multi-select': {
			const multiSelectSchema = columnSchema as MultiSelectColumnSchema;
			if (multiSelectSchema.options.length === 0) {
				throw new Error('Multi-select column must have at least one option');
			}
			return z.array(
				z.enum(multiSelectSchema.options as [string, ...string[]]),
			) as ColumnSchemaToZod<C>;
		}

		case 'ytext':
		case 'yxmlfragment':
			// YJS types are represented as any for schema validation
			return z.any() as ColumnSchemaToZod<C>;

		default:
			const _exhaustive: never = columnSchema;
			throw new Error(`Unknown column type: ${(_exhaustive as any).type}`);
	}
}
