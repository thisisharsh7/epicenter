/**
 * @fileoverview Core schema type definitions
 *
 * Contains the foundational types for the schema system:
 * - Column schema types (IdColumnSchema, TextColumnSchema, etc.)
 * - Table and workspace schemas
 * - Row value types (CellValue, SerializedRow, Row)
 *
 * Nullability is encoded in JSON Schema `type` field:
 * - Non-nullable: `type: 'string'`
 * - Nullable: `type: ['string', 'null']`
 *
 * Other schema-related types are co-located with their implementations:
 * - Id type and generateId function → id.ts
 * - DateWithTimezone types and functions → date-with-timezone.ts
 * - Validation types and functions → validation.ts
 */

import type * as Y from 'yjs';
import type { YRow } from '../db/table-helper';
import type {
	DateWithTimezone,
	DateWithTimezoneString,
} from './date-with-timezone';
import type {
	StandardJSONSchemaV1,
	StandardSchemaV1,
	StandardSchemaWithJSONSchema,
} from './standard-schema';

type ColumnStandard<T> = {
	'~standard': StandardSchemaV1.Props<T> & StandardJSONSchemaV1.Props<T>;
};

export type IdColumnSchema = {
	'x-component': 'id';
	type: 'string';
} & ColumnStandard<string>;

export type TextColumnSchema<TNullable extends boolean = boolean> = {
	'x-component': 'text';
	type: TNullable extends true ? readonly ['string', 'null'] : 'string';
	default?: string;
} & ColumnStandard<TNullable extends true ? string | null : string>;

export type YtextColumnSchema<TNullable extends boolean = boolean> = {
	'x-component': 'ytext';
	type: TNullable extends true ? readonly ['string', 'null'] : 'string';
} & ColumnStandard<TNullable extends true ? string | null : string>;

export type IntegerColumnSchema<TNullable extends boolean = boolean> = {
	'x-component': 'integer';
	type: TNullable extends true ? readonly ['integer', 'null'] : 'integer';
	default?: number;
} & ColumnStandard<TNullable extends true ? number | null : number>;

export type RealColumnSchema<TNullable extends boolean = boolean> = {
	'x-component': 'real';
	type: TNullable extends true ? readonly ['number', 'null'] : 'number';
	default?: number;
} & ColumnStandard<TNullable extends true ? number | null : number>;

export type BooleanColumnSchema<TNullable extends boolean = boolean> = {
	'x-component': 'boolean';
	type: TNullable extends true ? readonly ['boolean', 'null'] : 'boolean';
	default?: boolean;
} & ColumnStandard<TNullable extends true ? boolean | null : boolean>;

export type DateColumnSchema<TNullable extends boolean = boolean> = {
	'x-component': 'date';
	type: TNullable extends true ? readonly ['string', 'null'] : 'string';
	format: 'date';
	default?: DateWithTimezone;
} & ColumnStandard<TNullable extends true ? string | null : string>;

export type SelectColumnSchema<
	TOptions extends readonly [string, ...string[]] = readonly [
		string,
		...string[],
	],
	TNullable extends boolean = boolean,
> = {
	'x-component': 'select';
	type: TNullable extends true ? readonly ['string', 'null'] : 'string';
	enum: TOptions;
	default?: TOptions[number];
} & ColumnStandard<
	TNullable extends true ? TOptions[number] | null : TOptions[number]
>;

export type TagsColumnSchema<
	TOptions extends readonly [string, ...string[]] = readonly [
		string,
		...string[],
	],
	TNullable extends boolean = boolean,
> = {
	'x-component': 'tags';
	type: TNullable extends true ? readonly ['array', 'null'] : 'array';
	items: { type: 'string'; enum?: TOptions };
	uniqueItems: true;
	default?: TOptions[number][];
} & ColumnStandard<
	TNullable extends true ? TOptions[number][] | null : TOptions[number][]
>;

export type JsonColumnSchema<
	TSchema extends StandardSchemaWithJSONSchema = StandardSchemaWithJSONSchema,
	TNullable extends boolean = boolean,
> = {
	'x-component': 'json';
	type: TNullable extends true ? readonly ['object', 'null'] : 'object';
	schema: TSchema;
	default?: StandardSchemaV1.InferOutput<TSchema>;
} & ColumnStandard<
	TNullable extends true
		? StandardSchemaV1.InferOutput<TSchema> | null
		: StandardSchemaV1.InferOutput<TSchema>
>;

export type ColumnSchema =
	| IdColumnSchema
	| TextColumnSchema
	| YtextColumnSchema
	| IntegerColumnSchema
	| RealColumnSchema
	| BooleanColumnSchema
	| DateColumnSchema
	| SelectColumnSchema
	| TagsColumnSchema
	| JsonColumnSchema;

export type ColumnComponent = ColumnSchema['x-component'];

type IsNullableType<T> = T extends readonly [unknown, 'null'] ? true : false;

export type CellValue<C extends ColumnSchema = ColumnSchema> =
	C extends IdColumnSchema
		? string
		: C extends TextColumnSchema
			? IsNullableType<C['type']> extends true
				? string | null
				: string
			: C extends YtextColumnSchema
				? IsNullableType<C['type']> extends true
					? Y.Text | null
					: Y.Text
				: C extends IntegerColumnSchema
					? IsNullableType<C['type']> extends true
						? number | null
						: number
					: C extends RealColumnSchema
						? IsNullableType<C['type']> extends true
							? number | null
							: number
						: C extends BooleanColumnSchema
							? IsNullableType<C['type']> extends true
								? boolean | null
								: boolean
							: C extends DateColumnSchema
								? IsNullableType<C['type']> extends true
									? DateWithTimezoneString | null
									: DateWithTimezoneString
								: C extends SelectColumnSchema<infer TOptions>
									? IsNullableType<C['type']> extends true
										? TOptions[number] | null
										: TOptions[number]
									: C extends TagsColumnSchema<infer TOptions>
										? IsNullableType<C['type']> extends true
											? Y.Array<TOptions[number]> | null
											: Y.Array<TOptions[number]>
										: C extends JsonColumnSchema<
													infer TSchema extends StandardSchemaWithJSONSchema
												>
											? IsNullableType<C['type']> extends true
												? StandardSchemaV1.InferOutput<TSchema> | null
												: StandardSchemaV1.InferOutput<TSchema>
											: never;

export type SerializedCellValue<C extends ColumnSchema = ColumnSchema> =
	CellValue<C> extends infer T
		? T extends Y.Text
			? string
			: T extends Y.Array<infer U>
				? U[]
				: T extends DateWithTimezone
					? DateWithTimezoneString
					: T
		: never;

export type TableSchema = { id: IdColumnSchema } & Record<string, ColumnSchema>;

export type WorkspaceSchema = Record<string, TableSchema>;

export type Row<TTableSchema extends TableSchema = TableSchema> = {
	readonly [K in keyof TTableSchema]: CellValue<TTableSchema[K]>;
} & {
	toJSON(): SerializedRow<TTableSchema>;
	readonly $yRow: YRow;
};

export type SerializedRow<TTableSchema extends TableSchema = TableSchema> = {
	[K in keyof TTableSchema]: K extends 'id'
		? string
		: SerializedCellValue<TTableSchema[K]>;
};

export type PartialSerializedRow<
	TTableSchema extends TableSchema = TableSchema,
> = {
	id: string;
} & Partial<Omit<SerializedRow<TTableSchema>, 'id'>>;

export type KvColumnSchema = Exclude<ColumnSchema, IdColumnSchema>;

export type KvSchema = Record<string, KvColumnSchema>;

export type KvValue<C extends KvColumnSchema = KvColumnSchema> = CellValue<C>;

export type SerializedKvValue<C extends KvColumnSchema = KvColumnSchema> =
	SerializedCellValue<C>;
