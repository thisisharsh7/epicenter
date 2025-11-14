/**
 * @fileoverview Converts ColumnSchema to arktype Type definitions
 *
 * This converter transforms epicenter ColumnSchema definitions into arktype types
 * for runtime validation and schema composition. Unlike raw arktype definitions,
 * this maintains proper TypeScript inference for object methods like .partial() and .merge().
 *
 * **Key Design Decision**: Returns raw arktype definition strings/objects (not Type instances)
 * to enable proper type inference when passed to `type()`. This allows arktype to correctly
 * infer ObjectType with composition methods available.
 */

import type { StandardSchemaV1 } from '@standard-schema/spec';
import { type Type, type } from 'arktype';
import type {
	BooleanColumnSchema,
	ColumnSchema,
	DateColumnSchema,
	DateWithTimezoneString,
	IdColumnSchema,
	IntegerColumnSchema,
	JsonColumnSchema,
	RealColumnSchema,
	SelectColumnSchema,
	SerializedRow,
	TableSchema,
	TagsColumnSchema,
	TextColumnSchema,
	YtextColumnSchema,
} from '../../schema';
import { DATE_WITH_TIMEZONE_STRING_REGEX } from '../regex';
import type { ObjectType } from 'arktype/internal/variants/object.ts';

/**
 * Maps a ColumnSchema to its corresponding arktype Type
 * Similar to ColumnToDrizzle in drizzle.ts, but for arktype
 *
 * This type mapping ensures proper TypeScript inference when building
 * schema fields, preserving exact key information from TSchema.
 */
export type ColumnSchemaToArktypeType<C extends ColumnSchema> =
	C extends IdColumnSchema
		? Type<string>
		: C extends TextColumnSchema<infer TNullable>
			? TNullable extends true
				? Type<string | null>
				: Type<string>
			: C extends YtextColumnSchema<infer TNullable>
				? TNullable extends true
					? Type<string | null>
					: Type<string>
				: C extends IntegerColumnSchema<infer TNullable>
					? TNullable extends true
						? Type<number | null>
						: Type<number>
					: C extends RealColumnSchema<infer TNullable>
						? TNullable extends true
							? Type<number | null>
							: Type<number>
						: C extends BooleanColumnSchema<infer TNullable>
							? TNullable extends true
								? Type<boolean | null>
								: Type<boolean>
							: C extends DateColumnSchema<infer TNullable>
								? TNullable extends true
									? Type<DateWithTimezoneString | null>
									: Type<DateWithTimezoneString>
								: C extends SelectColumnSchema<infer TOptions, infer TNullable>
									? TNullable extends true
										? Type<TOptions[number] | null>
										: Type<TOptions[number]>
									: C extends TagsColumnSchema<infer TOptions, infer TNullable>
										? TNullable extends true
											? Type<TOptions[number][] | null>
											: Type<TOptions[number][]>
										: C extends JsonColumnSchema<
													infer TSchema,
													infer TNullable
											  >
											? TNullable extends true
												? Type<StandardSchemaV1.InferOutput<TSchema> | null>
												: Type<StandardSchemaV1.InferOutput<TSchema>>
											: never;

/**
 * Converts a TableSchema to a fully instantiated arktype Type.
 *
 * Returns a ready-to-use arktype Type instance with all composition methods available
 * (.partial(), .merge(), .array(), etc.).
 *
 * @param tableSchema - The table schema to convert
 * @returns Complete arktype Type instance with composition methods
 *
 * @example
 * ```typescript
 * const schema = {
 *   id: id(),
 *   title: text(),
 *   count: integer({ nullable: true })
 * };
 *
 * const validator = tableSchemaToArktypeType(schema);
 *
 * // Use immediately for validation
 * const result = validator({ id: '123', title: 'Test', count: 42 });
 *
 * // Or compose with other operations
 * const partialValidator = validator.partial().merge({ id: type.string });
 * const arrayValidator = validator.array();
 * ```
 */
export function tableSchemaToArktypeType<TSchema extends TableSchema>(
	tableSchema: TSchema,
): ObjectType<SerializedRow<TSchema>> {
	const fields: Record<string, Type> = {};

	for (const [fieldName, columnSchema] of Object.entries(tableSchema)) {
		fields[fieldName] = columnSchemaToArktypeType(columnSchema);
	}

	// Cast to any to bypass arktype's strict type inference
	// The mapped type is too complex for TypeScript to infer properly
	return type(fields as any) as ObjectType<SerializedRow<TSchema>>;
}

/**
 * Converts a single ColumnSchema to a raw arktype definition (not Type instance).
 *
 * **Important**: Returns raw arktype-parseable values (Type instances, not strings)
 * that can be passed to `type()` for proper ObjectType inference.
 *
 * **JSON Schema Compatibility**: Must use only features that convert to JSON Schema
 * because these schemas are used in action inputs that get converted by MCP/OpenAPI:
 * - ✅ `.matching(regex)` - Converts to JSON Schema pattern
 * - ❌ `.filter(fn)` - Cannot convert to JSON Schema
 *
 * For rigorous validation including custom predicates, use the validateXyz() methods
 * in TableValidators which operate directly on StandardSchemaV1.
 *
 * @param columnSchema - The column schema to convert
 * @returns Raw arktype Type (not a Type instance) suitable for passing to type()
 */
function columnSchemaToArktypeType(columnSchema: ColumnSchema): Type {
	let baseType: Type;

	switch (columnSchema.type) {
		case 'id':
		case 'text':
		case 'ytext':
			baseType = type.string;
			break;
		case 'integer':
			baseType = type.number.divisibleBy(1);
			break;
		case 'real':
			baseType = type.number;
			break;
		case 'boolean':
			baseType = type.boolean;
			break;
		case 'date':
			baseType = type.string
				.describe(
					'ISO 8601 date with timezone (e.g., 2024-01-01T20:00:00.000Z|America/New_York)',
				)
				.matching(DATE_WITH_TIMEZONE_STRING_REGEX);
			break;
		case 'select':
			baseType = type.enumerated(...columnSchema.options);
			break;
		case 'multi-select':
			// If options provided, validate against them; otherwise allow any string array
			baseType = columnSchema.options
				? type.enumerated(...columnSchema.options).array()
				: type.string.array();
			break;
		case 'json':
			// Return type.unknown for JSON columns to maintain JSON schema compatibility
			// Actual validation happens via StandardSchemaV1 in validateYRow/validateSerializedRow
			//
			// We CANNOT use .filter() here because:
			// 1. These schemas are converted to JSON Schema for MCP/OpenAPI
			// 2. Custom predicates (.filter) cannot be represented in JSON Schema
			// 3. The conversion would fail or lose the validation logic
			baseType = type.unknown;
			break;
	}

	// Handle nullable columns (skip id which is never nullable)
	if (columnSchema.type === 'id') {
		return baseType;
	}

	return columnSchema.nullable ? baseType.or(type.null) : baseType;
}
