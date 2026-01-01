/**
 * @fileoverview Core schema type definitions
 *
 * Contains the foundational types for the schema system:
 * - Field schema types (IdFieldSchema, TextFieldSchema, etc.)
 * - Table and workspace schemas
 * - Row value types (CellValue, SerializedRow, Row)
 *
 * ## Schema Structure
 *
 * Each field schema is a JSON Schema object with an `x-component` discriminant:
 * - `x-component`: UI component hint (e.g., 'text', 'select', 'tags')
 * - `type`: JSON Schema type, encodes nullability as `['string', 'null']`
 * - `~standard`: Standard Schema validation and JSON Schema serialization
 *
 * ## Nullability
 *
 * Nullability is encoded in the JSON Schema `type` field:
 * - Non-nullable: `type: 'string'`
 * - Nullable: `type: ['string', 'null']`
 *
 * This follows JSON Schema conventions and enables round-trip serialization.
 *
 * ## Related Files
 *
 * - `fields.ts` - Factory functions for creating field schemas
 * - `id.ts` - Id type and generateId function
 * - `date-with-timezone.ts` - DateWithTimezone types and functions
 * - `validation.ts` - Validation types and functions
 * - `nullability.ts` - isNullableFieldSchema helper
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

// ============================================================================
// Column Schema Types
// ============================================================================

/**
 * Internal type for the `~standard` property on column schemas.
 * Combines Standard Schema validation with JSON Schema serialization.
 */
type FieldStandard<T> = {
	'~standard': StandardSchemaV1.Props<T> & StandardJSONSchemaV1.Props<T>;
};

/**
 * ID column schema - auto-generated primary key.
 * Always NOT NULL, always type 'string'.
 *
 * @example
 * ```typescript
 * { 'x-component': 'id', type: 'string', '~standard': {...} }
 * ```
 */
export type IdFieldSchema = {
	'x-component': 'id';
	type: 'string';
} & FieldStandard<string>;

/**
 * Text column schema - single-line string input.
 * Nullability encoded in `type`: `'string'` or `['string', 'null']`.
 */
export type TextFieldSchema<TNullable extends boolean = boolean> = {
	'x-component': 'text';
	type: TNullable extends true ? readonly ['string', 'null'] : 'string';
	default?: string;
} & FieldStandard<TNullable extends true ? string | null : string>;

/**
 * Y.Text column schema - collaborative text using YJS.
 * Stored as Y.Text for real-time collaboration, serializes to string.
 * Ideal for code editors (Monaco, CodeMirror) and rich text (Quill).
 */
export type YtextFieldSchema<TNullable extends boolean = boolean> = {
	'x-component': 'ytext';
	type: TNullable extends true ? readonly ['string', 'null'] : 'string';
} & FieldStandard<TNullable extends true ? string | null : string>;

/**
 * Integer column schema - whole numbers.
 * JSON Schema type is 'integer', not 'number'.
 */
export type IntegerFieldSchema<TNullable extends boolean = boolean> = {
	'x-component': 'integer';
	type: TNullable extends true ? readonly ['integer', 'null'] : 'integer';
	default?: number;
} & FieldStandard<TNullable extends true ? number | null : number>;

/**
 * Real/float column schema - decimal numbers.
 * JSON Schema type is 'number'.
 */
export type RealFieldSchema<TNullable extends boolean = boolean> = {
	'x-component': 'real';
	type: TNullable extends true ? readonly ['number', 'null'] : 'number';
	default?: number;
} & FieldStandard<TNullable extends true ? number | null : number>;

/**
 * Boolean column schema - true/false values.
 */
export type BooleanFieldSchema<TNullable extends boolean = boolean> = {
	'x-component': 'boolean';
	type: TNullable extends true ? readonly ['boolean', 'null'] : 'boolean';
	default?: boolean;
} & FieldStandard<TNullable extends true ? boolean | null : boolean>;

/**
 * Date column schema - timezone-aware dates.
 * Stored as DateWithTimezoneString format: `{iso}[{timezone}]`.
 * Uses JSON Schema format 'date' for validation hint.
 */
export type DateFieldSchema<TNullable extends boolean = boolean> = {
	'x-component': 'date';
	type: TNullable extends true ? readonly ['string', 'null'] : 'string';
	format: 'date';
	default?: DateWithTimezone;
} & FieldStandard<TNullable extends true ? string | null : string>;

/**
 * Select column schema - single choice from predefined options.
 * Uses JSON Schema `enum` for option validation.
 *
 * @example
 * ```typescript
 * {
 *   'x-component': 'select',
 *   type: 'string',
 *   enum: ['draft', 'published', 'archived'],
 *   default: 'draft'
 * }
 * ```
 */
export type SelectFieldSchema<
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
} & FieldStandard<
	TNullable extends true ? TOptions[number] | null : TOptions[number]
>;

/**
 * Tags column schema - array of strings with optional validation.
 * Stored as Y.Array for real-time collaboration.
 *
 * Two modes:
 * - With `items.enum`: Only values from options are allowed
 * - Without `items.enum`: Any string array is allowed
 *
 * @example
 * ```typescript
 * // Validated tags
 * {
 *   'x-component': 'tags',
 *   type: 'array',
 *   items: { type: 'string', enum: ['urgent', 'normal', 'low'] },
 *   uniqueItems: true
 * }
 *
 * // Unconstrained tags
 * {
 *   'x-component': 'tags',
 *   type: 'array',
 *   items: { type: 'string' },
 *   uniqueItems: true
 * }
 * ```
 */
export type TagsFieldSchema<
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
} & FieldStandard<
	TNullable extends true ? TOptions[number][] | null : TOptions[number][]
>;

/**
 * JSON column schema - arbitrary JSON validated by a Standard Schema.
 *
 * The `schema` property holds a Standard Schema (ArkType, Zod v4.2+, Valibot)
 * that validates the JSON value. The schema must support JSON Schema conversion
 * for MCP/OpenAPI compatibility.
 *
 * **Avoid in schema property:**
 * - Transforms: `.pipe()`, `.transform()`
 * - Custom validation: `.filter()`, `.refine()`
 * - Non-JSON types: `bigint`, `symbol`, `Date`, `Map`, `Set`
 *
 * @example
 * ```typescript
 * {
 *   'x-component': 'json',
 *   type: 'object',
 *   schema: type({ theme: 'string', darkMode: 'boolean' }),
 *   default: { theme: 'dark', darkMode: true }
 * }
 * ```
 */
export type JsonFieldSchema<
	TSchema extends StandardSchemaWithJSONSchema = StandardSchemaWithJSONSchema,
	TNullable extends boolean = boolean,
> = {
	'x-component': 'json';
	type: TNullable extends true ? readonly ['object', 'null'] : 'object';
	schema: TSchema;
	default?: StandardSchemaV1.InferOutput<TSchema>;
} & FieldStandard<
	TNullable extends true
		? StandardSchemaV1.InferOutput<TSchema> | null
		: StandardSchemaV1.InferOutput<TSchema>
>;

// ============================================================================
// Discriminated Unions and Utility Types
// ============================================================================

/**
 * Discriminated union of all column schema types.
 * Use `x-component` to narrow to a specific type.
 */
export type FieldSchema =
	| IdFieldSchema
	| TextFieldSchema
	| YtextFieldSchema
	| IntegerFieldSchema
	| RealFieldSchema
	| BooleanFieldSchema
	| DateFieldSchema
	| SelectFieldSchema
	| TagsFieldSchema
	| JsonFieldSchema;

/**
 * Extract the component name from a column schema.
 * One of: 'id', 'text', 'ytext', 'integer', 'real', 'boolean', 'date', 'select', 'tags', 'json'
 */
export type FieldComponent = FieldSchema['x-component'];

/**
 * Helper type to check if a JSON Schema type array includes 'null'.
 * Used internally to derive nullability from the `type` field.
 */
type IsNullableType<T> = T extends readonly [unknown, 'null'] ? true : false;

// ============================================================================
// Value Types
// ============================================================================

/**
 * Maps a field schema to its runtime value type (Y.js types or primitives).
 *
 * - YtextFieldSchema → Y.Text
 * - TagsFieldSchema → Y.Array
 * - DateFieldSchema → DateWithTimezoneString
 * - Other fields → primitive types
 *
 * Nullability is derived from the schema's `type` field.
 */
export type CellValue<C extends FieldSchema = FieldSchema> =
	C extends IdFieldSchema
		? string
		: C extends TextFieldSchema
			? IsNullableType<C['type']> extends true
				? string | null
				: string
			: C extends YtextFieldSchema
				? IsNullableType<C['type']> extends true
					? Y.Text | null
					: Y.Text
				: C extends IntegerFieldSchema
					? IsNullableType<C['type']> extends true
						? number | null
						: number
					: C extends RealFieldSchema
						? IsNullableType<C['type']> extends true
							? number | null
							: number
						: C extends BooleanFieldSchema
							? IsNullableType<C['type']> extends true
								? boolean | null
								: boolean
							: C extends DateFieldSchema
								? IsNullableType<C['type']> extends true
									? DateWithTimezoneString | null
									: DateWithTimezoneString
								: C extends SelectFieldSchema<infer TOptions>
									? IsNullableType<C['type']> extends true
										? TOptions[number] | null
										: TOptions[number]
									: C extends TagsFieldSchema<infer TOptions>
										? IsNullableType<C['type']> extends true
											? Y.Array<TOptions[number]> | null
											: Y.Array<TOptions[number]>
										: C extends JsonFieldSchema<
													infer TSchema extends StandardSchemaWithJSONSchema
												>
											? IsNullableType<C['type']> extends true
												? StandardSchemaV1.InferOutput<TSchema> | null
												: StandardSchemaV1.InferOutput<TSchema>
											: never;

/**
 * Maps a column schema to its JSON-serializable value type.
 *
 * Converts Y.js types to plain values:
 * - Y.Text → string
 * - Y.Array → array
 * - DateWithTimezone → DateWithTimezoneString
 */
export type SerializedCellValue<C extends FieldSchema = FieldSchema> =
	CellValue<C> extends infer T
		? T extends Y.Text
			? string
			: T extends Y.Array<infer U>
				? U[]
				: T extends DateWithTimezone
					? DateWithTimezoneString
					: T
		: never;

// ============================================================================
// Table and Workspace Schemas
// ============================================================================

/**
 * Table schema - maps field names to field schemas.
 * Must always include an 'id' field with IdFieldSchema.
 *
 * @example
 * ```typescript
 * const postsSchema = {
 *   id: id(),
 *   title: text(),
 *   status: select({ options: ['draft', 'published'] }),
 * } satisfies TableSchema;
 * ```
 */
export type TableSchema = { id: IdFieldSchema } & Record<string, FieldSchema>;

/**
 * Workspace schema - maps table names to table schemas.
 *
 * @example
 * ```typescript
 * const blogSchema = {
 *   posts: postsTableSchema,
 *   authors: authorsTableSchema,
 * } satisfies WorkspaceSchema;
 * ```
 */
export type WorkspaceSchema = Record<string, TableSchema>;

// ============================================================================
// Row Types
// ============================================================================

/**
 * Runtime row type with Y.js types and utility methods.
 *
 * Properties are readonly and typed according to their column schemas.
 * Includes:
 * - `toJSON()`: Serialize to plain JSON (converts Y.js types)
 * - `$yRow`: Access to the underlying Y.Map
 */
export type Row<TTableSchema extends TableSchema = TableSchema> = {
	readonly [K in keyof TTableSchema]: CellValue<TTableSchema[K]>;
} & {
	toJSON(): SerializedRow<TTableSchema>;
	readonly $yRow: YRow;
};

/**
 * JSON-serializable row type.
 * All values are plain primitives/objects (no Y.js types).
 */
export type SerializedRow<TTableSchema extends TableSchema = TableSchema> = {
	[K in keyof TTableSchema]: K extends 'id'
		? string
		: SerializedCellValue<TTableSchema[K]>;
};

/**
 * Partial serialized row for updates.
 * ID is required, all other fields are optional.
 */
export type PartialSerializedRow<
	TTableSchema extends TableSchema = TableSchema,
> = {
	id: string;
} & Partial<Omit<SerializedRow<TTableSchema>, 'id'>>;

// ============================================================================
// Key-Value Schema Types
// ============================================================================

/**
 * Field schema for KV stores (excludes IdFieldSchema).
 * KV entries don't have IDs; they're keyed by string.
 */
export type KvFieldSchema = Exclude<FieldSchema, IdFieldSchema>;

/**
 * KV schema - maps key names to column schemas.
 */
export type KvSchema = Record<string, KvFieldSchema>;

/**
 * Runtime value type for a KV entry.
 */
export type KvValue<C extends KvFieldSchema = KvFieldSchema> = CellValue<C>;

/**
 * Serialized value type for a KV entry.
 */
export type SerializedKvValue<C extends KvFieldSchema = KvFieldSchema> =
	SerializedCellValue<C>;
