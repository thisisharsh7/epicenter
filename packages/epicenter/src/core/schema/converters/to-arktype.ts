/**
 * Converts FieldSchema to arktype Type definitions for runtime validation.
 *
 * Returns raw arktype definitions to enable proper type inference for
 * object methods like .partial() and .merge().
 */

import { type Type, type } from 'arktype';
import type { TSchema, Static } from 'typebox';
import type { ObjectType } from 'arktype/internal/variants/object.ts';
import type {
	BooleanFieldSchema,
	DateFieldSchema,
	FieldSchema,
	FieldsSchema,
	IdFieldSchema,
	IntegerFieldSchema,
	JsonFieldSchema,
	RealFieldSchema,
	RichtextFieldSchema,
	Row,
	SelectFieldSchema,
	TagsFieldSchema,
	TextFieldSchema,
} from '../fields/types';
import type { DateTimeString } from '../fields/datetime';
import { isNullableFieldSchema } from '../fields/helpers';
import { DATE_TIME_STRING_REGEX } from '../fields/regex';

/**
 * Maps a FieldSchema to its corresponding arktype Type.
 *
 * This type mapping ensures proper TypeScript inference when building
 * schema validators, preserving exact type information from the schema.
 *
 * @example
 * ```typescript
 * type TextType = FieldSchemaToArktype<{ type: 'text' }>; // Type<string>
 * type NullableInt = FieldSchemaToArktype<{ type: 'integer', nullable: true }>; // Type<number | null>
 * ```
 */
export type FieldSchemaToArktype<C extends FieldSchema> =
	C extends IdFieldSchema
		? Type<string>
		: C extends TextFieldSchema<infer TNullable>
			? TNullable extends true
				? Type<string | null>
				: Type<string>
			: C extends RichtextFieldSchema
				? Type<string | null>
				: C extends IntegerFieldSchema<infer TNullable>
					? TNullable extends true
						? Type<number | null>
						: Type<number>
					: C extends RealFieldSchema<infer TNullable>
						? TNullable extends true
							? Type<number | null>
							: Type<number>
						: C extends BooleanFieldSchema<infer TNullable>
							? TNullable extends true
								? Type<boolean | null>
								: Type<boolean>
							: C extends DateFieldSchema<infer TNullable>
								? TNullable extends true
									? Type<DateTimeString | null>
									: Type<DateTimeString>
								: C extends SelectFieldSchema<infer TOptions, infer TNullable>
									? TNullable extends true
										? Type<TOptions[number] | null>
										: Type<TOptions[number]>
									: C extends TagsFieldSchema<infer TOptions, infer TNullable>
										? TNullable extends true
											? Type<TOptions[number][] | null>
											: Type<TOptions[number][]>
										: C extends JsonFieldSchema<
													infer T extends TSchema,
													infer TNullable
												>
											? TNullable extends true
												? Type<Static<T> | null>
												: Type<Static<T>>
											: never;

/**
 * Converts a table schema to a fully instantiated arktype Type.
 *
 * Returns a ready-to-use arktype Type instance with all composition methods
 * available (.partial(), .merge(), .array(), etc.). Use this for validating
 * complete row objects.
 *
 * @param fieldsSchema - The table schema to convert
 * @returns Complete arktype Type instance with composition methods
 *
 * @example
 * ```typescript
 * const schema = {
 *   id: id(),
 *   title: text(),
 *   count: integer({ nullable: true }),
 * };
 *
 * const validator = tableSchemaToArktype(schema);
 *
 * // Use immediately for validation
 * const result = validator({ id: '123', title: 'Test', count: 42 });
 * if (result instanceof type.errors) {
 *   console.error('Validation failed:', result.summary);
 * }
 *
 * // Or compose with other operations
 * const partialValidator = validator.partial();
 * const arrayValidator = validator.array();
 * ```
 */
export function tableSchemaToArktype<TFieldsSchema extends FieldsSchema>(
	fieldsSchema: TFieldsSchema,
): ObjectType<Row<TFieldsSchema>> {
	return type(
		Object.fromEntries(
			Object.entries(fieldsSchema).map(([fieldName, fieldSchema]) => [
				fieldName,
				fieldSchemaToArktype(fieldSchema),
			]),
		),
	) as ObjectType<Row<TFieldsSchema>>;
}

/**
 * Converts a single FieldSchema to an arktype Type for runtime validation.
 *
 * Use this when you need to validate individual field values. For nullable
 * fields, automatically wraps with `.or(type.null).default(null)` so that
 * missing fields are defaulted to `null` during validation.
 *
 * Field type mappings:
 * - `id`, `text`, `richtext` → `type.string`
 * - `integer` → `type.number.divisibleBy(1)`
 * - `real` → `type.number`
 * - `boolean` → `type.boolean`
 * - `date` → `type.string.matching(DATE_TIME_STRING_REGEX)`
 * - `select` → `type.enumerated(...options)`
 * - `tags` → `type.enumerated(...options).array()` or `type.string.array()`
 * - `json` → uses the embedded arktype schema directly
 *
 * @param fieldSchema - The field schema to convert
 * @returns arktype Type suitable for validation and composition
 *
 * @example
 * ```typescript
 * const textValidator = fieldSchemaToArktype({ type: 'text' });
 * const selectValidator = fieldSchemaToArktype({
 *   type: 'select',
 *   options: ['draft', 'published'],
 * });
 *
 * textValidator('hello'); // 'hello'
 * selectValidator('draft'); // 'draft'
 * selectValidator('invalid'); // type.errors
 * ```
 */
export function fieldSchemaToArktype<C extends FieldSchema>(
	fieldSchema: C,
): FieldSchemaToArktype<C> {
	let baseType: Type;

	switch (fieldSchema.type) {
		case 'id':
		case 'text':
		case 'richtext':
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
				.matching(DATE_TIME_STRING_REGEX);
			break;
		case 'select':
			baseType = type.enumerated(...fieldSchema.options);
			break;
		case 'tags':
			baseType = fieldSchema.options
				? type.enumerated(...fieldSchema.options).array()
				: type.string.array();
			break;
		case 'json':
			baseType = fieldSchema.schema as unknown as Type<unknown, {}>;
			break;
	}

	const isNullable = isNullableFieldSchema(fieldSchema);
	return (
		isNullable ? baseType.or(type.null).default(null) : baseType
	) as FieldSchemaToArktype<C>;
}
