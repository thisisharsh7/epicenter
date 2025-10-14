import { type } from 'arktype';
import type {
	TableSchema,
	ColumnSchema,
	SelectColumnSchema,
	MultiSelectColumnSchema,
	DateColumnSchema,
} from '../core/schema';

/**
 * ArkType schema definition - can be a string or object
 */
type ArkTypeDefinition = string | Record<string, any>;

/**
 * Maps a ColumnSchema to its ArkType definition equivalent
 */
type ColumnSchemaToArkType<C extends ColumnSchema> = C extends DateColumnSchema
	? { date: 'Date'; timezone: 'string' }
	: string;

/**
 * Creates an ArkType schema for inserting data into a table.
 * - Omits the `id` field (auto-generated)
 * - Omits YJS fields (ytext, yxmlfragment) as they're created internally
 * - Fields with defaults are optional
 * - Handles nullable fields
 *
 * @param schema - The table schema to generate from
 *
 * @example
 * const insertSchema = createInsertSchema(db.schema.pages);
 */
export function createInsertSchema<TTableSchema extends TableSchema>(
	schema: TTableSchema,
) {
	const shape = Object.fromEntries(
		Object.entries(schema)
			.filter(([fieldName]) => fieldName !== 'id')
			.map(([fieldName, columnSchema]) => {
				let fieldDef = columnToArkType(columnSchema);

				// Handle nullable - make it optional AND nullable (can be omitted or null)
				const isNullable = 'nullable' in columnSchema && columnSchema.nullable;
				if (isNullable) {
					fieldDef = `${fieldDef}|null`;
				}

				// Handle defaults OR nullable (both make field optional)
				const hasDefault = 'default' in columnSchema && columnSchema.default !== undefined;
				if (hasDefault || isNullable) {
					const propName = `${fieldName}?`;
					return [propName, fieldDef];
				}

				return [fieldName, fieldDef];
			}),
	);

	return type(shape);
}

/**
 * Creates an ArkType schema for selecting/reading data from a table.
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
	const shape = Object.fromEntries(
		Object.entries(schema).map(([fieldName, columnSchema]) => {
			let fieldDef = columnToArkType(columnSchema);

			// Handle nullable
			if ('nullable' in columnSchema && columnSchema.nullable) {
				fieldDef = `${fieldDef}|null`;
			}

			return [fieldName, fieldDef];
		}),
	);

	return type(shape);
}

/**
 * Creates an ArkType schema for updating data in a table.
 * - `id` field is required
 * - All other fields are optional (partial update)
 * - Omits YJS fields (ytext, yxmlfragment)
 *
 * @param schema - The table schema to generate from
 *
 * @example
 * const updateSchema = createUpdateSchema(db.schema.pages);
 */
export function createUpdateSchema<TTableSchema extends TableSchema>(
	schema: TTableSchema,
) {
	const shape = Object.fromEntries(
		Object.entries(schema).map(([fieldName, columnSchema]) => {
			// id is required
			if (fieldName === 'id') {
				return [fieldName, 'string'];
			}

			let fieldDef = columnToArkType(columnSchema);

			// Handle nullable
			if ('nullable' in columnSchema && columnSchema.nullable) {
				fieldDef = `${fieldDef}|null`;
			}

			// Make all fields optional (partial update) - use ? suffix
			const propName = `${fieldName}?`;
			return [propName, fieldDef];
		}),
	);

	return type(shape);
}

/**
 * Converts a single column schema to its ArkType equivalent
 */
function columnToArkType<C extends ColumnSchema>(
	columnSchema: C,
): ColumnSchemaToArkType<C> {
	switch (columnSchema.type) {
		case 'id':
		case 'text':
			return 'string' as ColumnSchemaToArkType<C>;

		case 'integer':
			// ArkType doesn't have 'integer', use 'number % 1' for integers
			return 'number%1' as ColumnSchemaToArkType<C>;

		case 'real':
			return 'number' as ColumnSchemaToArkType<C>;

		case 'boolean':
			return 'boolean' as ColumnSchemaToArkType<C>;

		case 'date':
			// ArkType object with specific shape
			return { date: 'Date', timezone: 'string' } as ColumnSchemaToArkType<C>;

		case 'select': {
			const selectSchema = columnSchema as SelectColumnSchema;
			if (selectSchema.options.length === 0) {
				throw new Error('Select column must have at least one option');
			}
			// Create union of string literals: '"option1"|"option2"|"option3"'
			return selectSchema.options.map((opt) => `"${opt}"`).join('|') as ColumnSchemaToArkType<C>;
		}

		case 'multi-select': {
			const multiSelectSchema = columnSchema as MultiSelectColumnSchema;
			if (multiSelectSchema.options.length === 0) {
				throw new Error('Multi-select column must have at least one option');
			}
			// Create array of union: '("option1"|"option2")[]'
			const unionType = multiSelectSchema.options
				.map((opt) => `"${opt}"`)
				.join('|');
			return `(${unionType})[]` as ColumnSchemaToArkType<C>;
		}

		case 'ytext':
		case 'yxmlfragment':
			// YJS types are represented as any for schema validation
			return 'any' as ColumnSchemaToArkType<C>;

		default:
			const _exhaustive: never = columnSchema;
			throw new Error(`Unknown column type: ${(_exhaustive as any).type}`);
	}
}
