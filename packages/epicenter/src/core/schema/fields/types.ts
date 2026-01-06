/**
 * @fileoverview Core schema type definitions
 *
 * Contains the foundational types for the schema system:
 * - Field schema types (IdFieldSchema, TextFieldSchema, etc.)
 * - Table and workspace schemas
 * - Row value types (CellValue, RowData, Row)
 *
 * ## Schema Structure
 *
 * Each field schema is a pure JSON Schema object with an `x-component` discriminant:
 * - `x-component`: UI component hint (e.g., 'text', 'select', 'tags')
 * - `type`: JSON Schema type, encodes nullability as `['string', 'null']`
 *
 * Validation is handled by converters (to-arktype, to-standard) rather than
 * being embedded in the schema itself.
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
 * - `factories.ts` - Factory functions for creating field schemas
 * - `../converters/` - Converters for arktype, drizzle, json-schema
 * - `nullability.ts` - isNullableFieldSchema helper
 */

import type { YRow } from '../../tables/table-helper';
import type { DateTimeString } from '../runtime/datetime';
import type {
	StandardSchemaV1,
	StandardSchemaWithJSONSchema,
} from '../standard/types';

// ============================================================================
// Column Schema Types
// ============================================================================

/**
 * ID column schema - auto-generated primary key.
 * Always NOT NULL, always type 'string'.
 */
export type IdFieldSchema = {
	'x-component': 'id';
	type: 'string';
};

/**
 * Text column schema - single-line string input.
 * Nullability encoded in `type`: `'string'` or `['string', 'null']`.
 */
export type TextFieldSchema<TNullable extends boolean = boolean> = {
	'x-component': 'text';
	type: TNullable extends true ? readonly ['string', 'null'] : 'string';
	default?: string;
};

/**
 * Rich text reference column - stores ID pointing to separate rich content document.
 * The ID references a separate Y.Doc for collaborative editing.
 * The row itself just stores the string ID (JSON-serializable).
 *
 * Always nullable with default null - Y.Docs are created lazily when user first edits.
 */
export type RichtextFieldSchema = {
	'x-component': 'richtext';
	type: readonly ['string', 'null'];
	default: null;
};

/**
 * Integer column schema - whole numbers.
 * JSON Schema type is 'integer', not 'number'.
 */
export type IntegerFieldSchema<TNullable extends boolean = boolean> = {
	'x-component': 'integer';
	type: TNullable extends true ? readonly ['integer', 'null'] : 'integer';
	default?: number;
};

/**
 * Real/float column schema - decimal numbers.
 * JSON Schema type is 'number'.
 */
export type RealFieldSchema<TNullable extends boolean = boolean> = {
	'x-component': 'real';
	type: TNullable extends true ? readonly ['number', 'null'] : 'number';
	default?: number;
};

/**
 * Boolean column schema - true/false values.
 */
export type BooleanFieldSchema<TNullable extends boolean = boolean> = {
	'x-component': 'boolean';
	type: TNullable extends true ? readonly ['boolean', 'null'] : 'boolean';
	default?: boolean;
};

/**
 * Date column schema - timezone-aware dates.
 * Stored as DateTimeString format: `{iso}|{timezone}`.
 * Uses `pattern` for JSON Schema validation (not `format: 'date'` which implies RFC 3339).
 */
export type DateFieldSchema<TNullable extends boolean = boolean> = {
	'x-component': 'date';
	type: TNullable extends true ? readonly ['string', 'null'] : 'string';
	description: string;
	pattern: string;
	default?: DateTimeString;
};

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
};

/**
 * Tags column schema - array of strings with optional validation.
 * Stored as plain arrays (JSON-serializable).
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
};

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
};

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
	| RichtextFieldSchema
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
 * Maps a field schema to its runtime value type.
 *
 * - RichtextFieldSchema → string (ID reference)
 * - TagsFieldSchema → string[] (plain array)
 * - DateFieldSchema → DateTimeString
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
			: C extends RichtextFieldSchema
				? IsNullableType<C['type']> extends true
					? string | null
					: string
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
									? DateTimeString | null
									: DateTimeString
								: C extends SelectFieldSchema<infer TOptions>
									? IsNullableType<C['type']> extends true
										? TOptions[number] | null
										: TOptions[number]
									: C extends TagsFieldSchema<infer TOptions>
										? IsNullableType<C['type']> extends true
											? TOptions[number][] | null
											: TOptions[number][]
										: C extends JsonFieldSchema<
													infer TSchema extends StandardSchemaWithJSONSchema
												>
											? IsNullableType<C['type']> extends true
												? StandardSchemaV1.InferOutput<TSchema> | null
												: StandardSchemaV1.InferOutput<TSchema>
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
 * Tables schema - maps table names to table schemas.
 * Represents all tables in a workspace.
 *
 * @example
 * ```typescript
 * const blogTables = {
 *   posts: postsTableSchema,
 *   authors: authorsTableSchema,
 * } satisfies TablesSchema;
 * ```
 */
export type TablesSchema = Record<string, TableSchema>;

/**
 * @deprecated Use `TablesSchema` instead. This type will be removed in a future version.
 *
 * Previously named "WorkspaceSchema" but renamed to "TablesSchema" for clarity,
 * since a workspace conceptually includes both tables AND KV storage.
 */
export type WorkspaceSchema = TablesSchema;

// ============================================================================
// Row Types
// ============================================================================

/**
 * Live proxy object for reading table data.
 *
 * `Row` is what you get back from read operations (`get`, `getAll`, `find`).
 * It wraps a Y.Map with getters, providing live access to collaborative data.
 *
 * Properties are readonly and typed according to their column schemas.
 *
 * **Row vs RowData:**
 * - `Row` = Live proxy (output type for reads). Has `toJSON()` and `$yRow`.
 * - `RowData` = Plain object (input type for writes). Just data, no methods.
 * - `Row` is a subtype of `RowData`, so you can pass a Row to `upsert()`.
 *
 * @example
 * ```typescript
 * const row = tables.posts.get({ id: '1' });
 * if (row.status === 'valid') {
 *   console.log(row.row.title);        // Access via getter
 *   const data = row.row.toJSON();     // Convert to plain object
 *   tables.posts.upsert(row.row);      // Works (Row is subtype of RowData)
 * }
 * ```
 */
export type Row<TTableSchema extends TableSchema = TableSchema> = {
	readonly [K in keyof TTableSchema]: CellValue<TTableSchema[K]>;
} & {
	/** Convert to plain RowData object. Only includes schema-defined fields. */
	toJSON(): RowData<TTableSchema>;
	/** Access the underlying Y.Map for advanced operations. */
	readonly $yRow: YRow;
};

/**
 * Plain data object for writing table data (Data Transfer Object).
 *
 * `RowData` is what you pass to write operations (`upsert`, `update`).
 * It's a simple POJO with no methods or Y.js references.
 *
 * **RowData vs Row:**
 * - `RowData` = Plain object (input type for writes). Just data, no methods.
 * - `Row` = Live proxy (output type for reads). Has `toJSON()` and `$yRow`.
 * - You cannot pass a plain `RowData` where `Row` is expected (missing methods).
 *
 * @example
 * ```typescript
 * // Pass plain object literals to upsert
 * tables.posts.upsert({ id: '1', title: 'Hello', published: false });
 *
 * // Providers return RowData from deserialization
 * const data: RowData = JSON.parse(fileContents);
 * tables.posts.upsert(data);
 * ```
 */
export type RowData<TTableSchema extends TableSchema = TableSchema> = {
	[K in keyof TTableSchema]: CellValue<TTableSchema[K]>;
};

/**
 * Partial row data for updates.
 * ID is required, all other fields are optional.
 *
 * @example
 * ```typescript
 * // Update only the title, leave other fields unchanged
 * tables.posts.update({ id: '1', title: 'New Title' });
 * ```
 */
export type PartialRowData<TTableSchema extends TableSchema = TableSchema> = {
	id: string;
} & Partial<Omit<RowData<TTableSchema>, 'id'>>;

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
