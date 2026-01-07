/**
 * Converts FieldSchema to TypeBox TSchema definitions for runtime validation.
 *
 * TypeBox schemas can be compiled to JIT validators using `Compile()` from `typebox/compile`.
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
	FieldsSchema,
	IdFieldSchema,
	IntegerFieldSchema,
	JsonFieldSchema,
	RealFieldSchema,
	RichtextFieldSchema,
	SelectFieldSchema,
	TagsFieldSchema,
	TextFieldSchema,
} from '../fields/types';
import { isNullableFieldSchema } from '../fields/nullability';
import { DATE_TIME_STRING_REGEX } from '../fields/regex';
import { ARKTYPE_JSON_SCHEMA_FALLBACK } from '../standard/arktype-fallback';

/**
 * Maps a FieldSchema to its corresponding TypeBox TSchema type.
 *
 * Use `Static<typeof schema>` to infer the TypeScript type from the returned schema.
 *
 * @example
 * ```typescript
 * const schema = fieldSchemaToTypebox({ type: 'text' });
 * type TextValue = Static<typeof schema>; // string
 *
 * const nullableSchema = fieldSchemaToTypebox({ type: 'integer', nullable: true });
 * type NullableInt = Static<typeof nullableSchema>; // number | null
 * ```
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
 * Converts a table schema to a TypeBox TObject schema.
 *
 * Use this when you need to validate entire row objects. The resulting schema
 * can be compiled to a JIT validator for high-performance validation.
 *
 * @param fieldsSchema - The table schema containing all field definitions
 * @returns A TypeBox TObject schema representing the table structure
 *
 * @example
 * ```typescript
 * import { Compile } from 'typebox/compile';
 *
 * const schema = {
 *   id: id(),
 *   title: text(),
 *   count: integer({ nullable: true }),
 * };
 *
 * const typeboxSchema = tableSchemaToTypebox(schema);
 * const validator = Compile(typeboxSchema);
 *
 * validator.Check({ id: '123', title: 'Test', count: 42 }); // true
 * validator.Check({ id: '123', title: 'Test', count: null }); // true (nullable)
 * validator.Check({ id: '123', title: 'Test' }); // false (missing count)
 * ```
 */
export function tableSchemaToTypebox<TFieldsSchema extends FieldsSchema>(
	fieldsSchema: TFieldsSchema,
): TObject {
	const properties: Record<string, TSchema> = {};

	for (const [fieldName, fieldSchema] of Object.entries(fieldsSchema)) {
		properties[fieldName] = fieldSchemaToTypebox(fieldSchema);
	}

	return Type.Object(properties);
}

/**
 * Converts a single FieldSchema to a TypeBox TSchema.
 *
 * Use this when you need to validate individual field values rather than
 * complete row objects. The resulting schema is JIT-compilable.
 *
 * Field type mappings:
 * - `id`, `text`, `richtext` → `Type.String()`
 * - `integer` → `Type.Integer()`
 * - `real` → `Type.Number()`
 * - `boolean` → `Type.Boolean()`
 * - `date` → `Type.String({ pattern })` with DateTimeString regex
 * - `select` → `Type.Union([Type.Literal(...), ...])`
 * - `tags` → `Type.Array(...)` with uniqueItems constraint
 * - `json` → JSON Schema from embedded StandardSchema (fully JIT-compiled)
 *
 * @param fieldSchema - The field schema to convert
 * @returns A TypeBox TSchema suitable for validation
 *
 * @example
 * ```typescript
 * const textSchema = fieldSchemaToTypebox({ type: 'text' });
 * const selectSchema = fieldSchemaToTypebox({
 *   type: 'select',
 *   options: ['draft', 'published'],
 * });
 * ```
 */
export function fieldSchemaToTypebox<C extends FieldSchema>(
	fieldSchema: C,
): FieldSchemaToTypebox<C> {
	let baseType: TSchema;

	switch (fieldSchema.type) {
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
			const literals = fieldSchema.options.map((value) => Type.Literal(value));
			baseType = Type.Union(literals);
			break;
		}

		case 'tags': {
			if (fieldSchema.options) {
				const literals = fieldSchema.options.map((value) =>
					Type.Literal(value),
				);
				baseType = Type.Array(Type.Union(literals), { uniqueItems: true });
			} else {
				baseType = Type.Array(Type.String(), { uniqueItems: true });
			}
			break;
		}

		case 'json': {
			const standardSchema = fieldSchema.schema;
			const jsonSchema = standardSchema['~standard'].jsonSchema.input({
				target: 'draft-2020-12',
				libraryOptions: {
					fallback: ARKTYPE_JSON_SCHEMA_FALLBACK,
				},
			});
			baseType = jsonSchema as TSchema;
			break;
		}
	}

	const isNullable = isNullableFieldSchema(fieldSchema);
	if (isNullable) {
		baseType = Type.Union([baseType, Type.Null()]);
	}

	return baseType as FieldSchemaToTypebox<C>;
}
