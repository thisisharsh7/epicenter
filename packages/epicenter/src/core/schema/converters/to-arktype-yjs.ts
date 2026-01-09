/**
 * Converts FieldDefinition to arktype Type definitions for YJS Row validation.
 *
 * Unlike to-arktype.ts which validates SerializedRow, this validates Row objects
 * where fields may contain YJS types.
 */

import { type Type, type } from 'arktype';
import { jsonSchemaToType } from '@ark/json-schema';
import type { TSchema, Static } from 'typebox';
import type { ObjectType } from 'arktype/internal/variants/object.ts';
import type {
	BooleanFieldSchema,
	FieldDefinition,
	FieldDefinitions,
	DateFieldSchema,
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
import { isNullableFieldDefinition } from '../fields/helpers';
import { DATE_TIME_STRING_REGEX } from '../fields/regex';

/**
 * Maps a FieldDefinition to its corresponding YJS-aware arktype Type.
 *
 * Unlike `FieldDefinitionToArktype` which validates serialized values, this type
 * validates Row objects that may contain YJS collaborative types. Use this
 * when working with live YJS data.
 *
 * @example
 * ```typescript
 * type TextType = FieldDefinitionToYjsArktype<{ type: 'text' }>; // Type<string>
 * type TagsType = FieldDefinitionToYjsArktype<{ type: 'tags', options: ['a', 'b'] }>; // Type<('a' | 'b')[]>
 * ```
 */
export type FieldDefinitionToYjsArktype<C extends FieldDefinition> =
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
									? Type<string | null>
									: Type<string>
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
 * Converts a table schema to an arktype Type for YJS Row validation.
 *
 * Use this validator to check that Row objects (built from Y.Maps) contain
 * correctly-typed values. Unlike `tableSchemaToArktype`, this is designed
 * for validating live YJS data before returning it to consumers.
 *
 * @param fieldsSchema - The table schema to convert
 * @returns Complete arktype Type instance that validates Row objects
 *
 * @example
 * ```typescript
 * const schema = {
 *   id: id(),
 *   title: text(),
 *   tags: tags({ options: ['tech', 'blog'] }),
 * };
 *
 * const validator = tableSchemaToYjsArktype(schema);
 *
 * // Build Row from Y.Map
 * const row = buildRowFromYRow(yrow, schema);
 *
 * // Validate the Row
 * const result = validator(row);
 * if (result instanceof type.errors) {
 *   console.error('YJS validation failed:', result.summary);
 * }
 * ```
 */
export function tableSchemaToYjsArktype<
	TFieldDefinitions extends FieldDefinitions,
>(fieldsSchema: TFieldDefinitions): ObjectType<Row<TFieldDefinitions>> {
	return type(
		Object.fromEntries(
			Object.entries(fieldsSchema).map(([fieldName, fieldSchema]) => [
				fieldName,
				fieldSchemaToYjsArktype(fieldSchema),
			]),
		),
	) as ObjectType<Row<TFieldDefinitions>>;
}

/**
 * Converts a single FieldDefinition to a YJS-aware arktype Type.
 *
 * Returns arktype Type instances that validate YJS cell values. Unlike
 * `fieldSchemaToArktype`, this validator is designed for Row objects
 * built from Y.Maps where values have already been extracted.
 *
 * @param fieldSchema - The field schema to convert
 * @returns Arktype Type that validates the YJS cell value
 *
 * @example
 * ```typescript
 * const textValidator = fieldSchemaToYjsArktype({ type: 'text' });
 * const tagsValidator = fieldSchemaToYjsArktype({
 *   type: 'tags',
 *   options: ['tech', 'blog'],
 * });
 *
 * textValidator('hello'); // 'hello'
 * tagsValidator(['tech']); // ['tech']
 * tagsValidator(['invalid']); // type.errors
 * ```
 */
export function fieldSchemaToYjsArktype<C extends FieldDefinition>(
	fieldSchema: C,
): FieldDefinitionToYjsArktype<C> {
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
			// TypeBox schemas ARE JSON Schema - convert to ArkType at runtime.
			// TODO: Remove cast when @ark/json-schema updates to arktype >=2.1.29
			// Type cast needed due to @ark/json-schema using older arktype version (2.1.23 vs 2.1.29).
			// Runtime behavior is correct; only TS types differ.
			baseType = jsonSchemaToType(fieldSchema.schema) as unknown as Type;
			break;
	}

	const isNullable = isNullableFieldDefinition(fieldSchema);
	return (
		isNullable ? baseType.or(type.null) : baseType
	) as FieldDefinitionToYjsArktype<C>;
}
