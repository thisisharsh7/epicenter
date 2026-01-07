/**
 * @fileoverview Converts FieldSchema to TypeBox TSchema definitions
 *
 * This converter transforms epicenter FieldSchema definitions into TypeBox schemas
 * for runtime validation. TypeBox schemas can be compiled to highly optimized
 * JIT validators using `Compile()` from `typebox/compile`.
 *
 * **Key Design Decisions**:
 * - Returns raw TypeBox schemas (TSchema), not compiled validators
 * - Nullable fields use `Type.Union([baseType, Type.Null()])`
 * - JSON fields use `Type.Refine()` to call embedded StandardSchema at runtime
 * - Select fields use `Type.Union([Type.Literal(...), ...])` for string literals
 */

import {
	Type,
	type TSchema,
	type TObject,
	type TString,
	type TInteger,
	type TNumber,
	type TBoolean,
	type TUnion,
	type TNull,
	type TArray,
} from 'typebox';
import type {
	BooleanFieldSchema,
	DateFieldSchema,
	FieldSchema,
	IdFieldSchema,
	IntegerFieldSchema,
	JsonFieldSchema,
	RealFieldSchema,
	RichtextFieldSchema,
	SelectFieldSchema,
	TableSchema,
	TagsFieldSchema,
	TextFieldSchema,
} from '../fields/types';
import { isNullableFieldSchema } from '../fields/nullability';
import { DATE_TIME_STRING_REGEX } from '../fields/regex';

/**
 * Maps a FieldSchema to its corresponding TypeBox TSchema type.
 *
 * Use `Static<typeof schema>` to infer the TypeScript type from the returned schema.
 */
export type FieldSchemaToTypebox<C extends FieldSchema> =
	C extends IdFieldSchema
		? TString
		: C extends TextFieldSchema<infer TNullable>
			? TNullable extends true
				? TUnion<[TString, TNull]>
				: TString
			: C extends RichtextFieldSchema
				? TUnion<[TString, TNull]>
				: C extends IntegerFieldSchema<infer TNullable>
					? TNullable extends true
						? TUnion<[TInteger, TNull]>
						: TInteger
					: C extends RealFieldSchema<infer TNullable>
						? TNullable extends true
							? TUnion<[TNumber, TNull]>
							: TNumber
						: C extends BooleanFieldSchema<infer TNullable>
							? TNullable extends true
								? TUnion<[TBoolean, TNull]>
								: TBoolean
							: C extends DateFieldSchema<infer TNullable>
								? TNullable extends true
									? TUnion<[TString, TNull]>
									: TString
								: C extends SelectFieldSchema<infer _TOptions, infer TNullable>
									? TNullable extends true
										? TUnion<TSchema[]>
										: TUnion<TSchema[]>
									: C extends TagsFieldSchema<infer _TOptions, infer TNullable>
										? TNullable extends true
											? TUnion<[TArray, TNull]>
											: TArray
										: C extends JsonFieldSchema<
													infer _TStandardSchema,
													infer TNullable
												>
											? TNullable extends true
												? TUnion<[TSchema, TNull]>
												: TSchema
											: never;

/**
 * Converts a TableSchema to a TypeBox TObject schema.
 *
 * @example
 * ```typescript
 * import { Compile } from 'typebox/compile';
 *
 * const schema = { id: id(), title: text(), count: integer({ nullable: true }) };
 * const typeboxSchema = tableSchemaToTypebox(schema);
 * const validator = Compile(typeboxSchema);
 *
 * validator.Check({ id: '123', title: 'Test', count: 42 }); // true
 * ```
 */
export function tableSchemaToTypebox<TTableSchema extends TableSchema>(
	tableSchema: TTableSchema,
): TObject {
	const properties: Record<string, TSchema> = {};

	for (const [fieldName, fieldSchema] of Object.entries(tableSchema)) {
		properties[fieldName] = fieldSchemaToTypebox(fieldSchema);
	}

	return Type.Object(properties);
}

/**
 * Converts a single FieldSchema to a TypeBox TSchema.
 *
 * Field type mappings:
 * - `id`, `text`, `richtext` -> `Type.String()`
 * - `integer` -> `Type.Integer()`
 * - `real` -> `Type.Number()`
 * - `boolean` -> `Type.Boolean()`
 * - `date` -> `Type.String({ pattern })`
 * - `select` -> `Type.Union([Type.Literal(...), ...])`
 * - `tags` -> `Type.Array(...)`
 * - `json` -> `Type.Refine(Type.Unknown(), standardSchemaValidate)`
 */
export function fieldSchemaToTypebox<C extends FieldSchema>(
	fieldSchema: C,
): FieldSchemaToTypebox<C> {
	let baseType: TSchema;

	switch (fieldSchema['x-component']) {
		case 'id':
		case 'text':
		case 'richtext':
			baseType = Type.String();
			break;

		case 'integer':
			baseType = Type.Integer();
			break;

		case 'real':
			baseType = Type.Number();
			break;

		case 'boolean':
			baseType = Type.Boolean();
			break;

		case 'date':
			baseType = Type.String({
				description:
					'ISO 8601 date with timezone (e.g., 2024-01-01T20:00:00.000Z|America/New_York)',
				pattern: DATE_TIME_STRING_REGEX.source,
			});
			break;

		case 'select': {
			const literals = fieldSchema.enum.map((value) => Type.Literal(value));
			baseType = Type.Union(literals);
			break;
		}

		case 'tags': {
			const itemsEnum = fieldSchema.items.enum;
			if (itemsEnum) {
				const literals = itemsEnum.map((value) => Type.Literal(value));
				baseType = Type.Array(Type.Union(literals), { uniqueItems: true });
			} else {
				baseType = Type.Array(Type.String(), { uniqueItems: true });
			}
			break;
		}

		case 'json': {
			const standardSchema = fieldSchema.schema;
			baseType = Type.Refine(
				Type.Unknown(),
				(value) => {
					const result = standardSchema['~standard'].validate(value);
					if (result instanceof Promise) return false;
					return !result.issues;
				},
				'JSON validation failed against embedded schema',
			);
			break;
		}
	}

	const isNullable = isNullableFieldSchema(fieldSchema);
	if (isNullable) {
		baseType = Type.Union([baseType, Type.Null()]);
	}

	return baseType as FieldSchemaToTypebox<C>;
}
