/**
 * @fileoverview Core schema type definitions
 *
 * Contains the foundational types for the schema system:
 * - Field schema types (IdFieldSchema, TextFieldSchema, etc.)
 * - Table and workspace schemas
 * - Row value types (CellValue, Row, PartialRow)
 *
 * ## Schema Structure
 *
 * Each field schema is a minimal object with `type` as the discriminant:
 * - `type`: Field type ('text', 'select', 'tags', etc.)
 * - `nullable`: Optional boolean for nullability
 * - Type-specific fields (e.g., `options` for select/tags)
 *
 * This is a Notion-like format optimized for user configuration and storage.
 * JSON Schema can be derived on-demand for MCP/OpenAPI export.
 *
 * ## Nullability
 *
 * Nullability is encoded in a simple boolean `nullable` field:
 * - Non-nullable: `nullable` omitted or `false`
 * - Nullable: `nullable: true`
 *
 * Special cases:
 * - `id`: Never nullable (implicit)
 * - `richtext`: Always nullable (implicit)
 *
 * ## Related Files
 *
 * - `factories.ts` - Factory functions for creating field schemas
 * - `../converters/` - Converters for arktype, drizzle, typebox
 * - `nullability.ts` - isNullableFieldSchema helper
 */

import type {
	StandardSchemaV1,
	StandardSchemaWithJSONSchema,
} from '../standard/types';
import type { DateTimeString } from './datetime';

// ============================================================================
// Field Schema Types
// ============================================================================

/**
 * ID field schema - auto-generated primary key.
 * Always NOT NULL (implicit, no nullable field needed).
 */
export type IdFieldSchema = {
	type: 'id';
};

/**
 * Text field schema - single-line string input.
 */
export type TextFieldSchema<TNullable extends boolean = boolean> = {
	type: 'text';
	nullable?: TNullable;
	default?: string;
};

/**
 * Rich text reference field - stores ID pointing to separate rich content document.
 * The ID references a separate Y.Doc for collaborative editing.
 * The row itself just stores the string ID (JSON-serializable).
 *
 * Always nullable - Y.Docs are created lazily when user first edits.
 * No need to specify nullable or default; they're implicit.
 */
export type RichtextFieldSchema = {
	type: 'richtext';
};

/**
 * Integer field schema - whole numbers.
 */
export type IntegerFieldSchema<TNullable extends boolean = boolean> = {
	type: 'integer';
	nullable?: TNullable;
	default?: number;
};

/**
 * Real/float field schema - decimal numbers.
 */
export type RealFieldSchema<TNullable extends boolean = boolean> = {
	type: 'real';
	nullable?: TNullable;
	default?: number;
};

/**
 * Boolean field schema - true/false values.
 */
export type BooleanFieldSchema<TNullable extends boolean = boolean> = {
	type: 'boolean';
	nullable?: TNullable;
	default?: boolean;
};

/**
 * Date field schema - timezone-aware dates.
 * Stored as DateTimeString format: `{iso}|{timezone}`.
 */
export type DateFieldSchema<TNullable extends boolean = boolean> = {
	type: 'date';
	nullable?: TNullable;
	default?: DateTimeString;
};

/**
 * Select field schema - single choice from predefined options.
 *
 * @example
 * ```typescript
 * {
 *   type: 'select',
 *   options: ['draft', 'published', 'archived'],
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
	type: 'select';
	options: TOptions;
	nullable?: TNullable;
	default?: TOptions[number];
};

/**
 * Tags field schema - array of strings with optional validation.
 * Stored as plain arrays (JSON-serializable).
 *
 * Two modes:
 * - With `options`: Only values from options are allowed
 * - Without `options`: Any string array is allowed
 *
 * @example
 * ```typescript
 * // Validated tags
 * { type: 'tags', options: ['urgent', 'normal', 'low'] }
 *
 * // Unconstrained tags
 * { type: 'tags' }
 * ```
 */
export type TagsFieldSchema<
	TOptions extends readonly [string, ...string[]] = readonly [
		string,
		...string[],
	],
	TNullable extends boolean = boolean,
> = {
	type: 'tags';
	options?: TOptions;
	nullable?: TNullable;
	default?: TOptions[number][];
};

/**
 * JSON field schema - arbitrary JSON validated by a Standard Schema.
 *
 * The `schema` property holds a Standard Schema (ArkType, Zod v4.2+, Valibot)
 * that validates the JSON value. The schema must support JSON Schema conversion
 * for MCP/OpenAPI compatibility (use StandardSchemaWithJSONSchema).
 *
 * **Avoid in schema property:**
 * - Transforms: `.pipe()`, `.transform()`
 * - Custom validation: `.filter()`, `.refine()`
 * - Non-JSON types: `bigint`, `symbol`, `Date`, `Map`, `Set`
 *
 * @example
 * ```typescript
 * {
 *   type: 'json',
 *   schema: type({ theme: 'string', darkMode: 'boolean' }),
 *   default: { theme: 'dark', darkMode: true }
 * }
 * ```
 */
export type JsonFieldSchema<
	TSchema extends StandardSchemaWithJSONSchema = StandardSchemaWithJSONSchema,
	TNullable extends boolean = boolean,
> = {
	type: 'json';
	schema: TSchema;
	nullable?: TNullable;
	default?: StandardSchemaV1.InferOutput<TSchema>;
};

// ============================================================================
// Discriminated Unions and Utility Types
// ============================================================================

/**
 * Discriminated union of all field schema types.
 * Use `type` to narrow to a specific type.
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
 * Extract the type name from a field schema.
 * One of: 'id', 'text', 'richtext', 'integer', 'real', 'boolean', 'date', 'select', 'tags', 'json'
 */
export type FieldType = FieldSchema['type'];

// ============================================================================
// Value Types
// ============================================================================

/**
 * Helper type to check if a field schema is nullable.
 *
 * Uses optional property check `{ nullable?: true }` because field schemas
 * define `nullable?: TNullable` (optional). When `TNullable = true`, the type
 * is `nullable?: true` which doesn't extend `{ nullable: true }` (required).
 *
 * This also correctly handles RichtextFieldSchema (no nullable property)
 * because optional properties can be absent.
 */
type IsNullable<C extends FieldSchema> = C extends { nullable?: true }
	? true
	: false;

/**
 * Maps a field schema to its runtime value type.
 *
 * - RichtextFieldSchema → string | null (always nullable)
 * - TagsFieldSchema → string[] (plain array)
 * - DateFieldSchema → DateTimeString
 * - Other fields → primitive types
 *
 * Nullability is derived from the schema's `nullable` field.
 */
export type CellValue<C extends FieldSchema = FieldSchema> =
	C extends IdFieldSchema
		? string
		: C extends TextFieldSchema
			? IsNullable<C> extends true
				? string | null
				: string
			: C extends RichtextFieldSchema
				? string | null // always nullable
				: C extends IntegerFieldSchema
					? IsNullable<C> extends true
						? number | null
						: number
					: C extends RealFieldSchema
						? IsNullable<C> extends true
							? number | null
							: number
						: C extends BooleanFieldSchema
							? IsNullable<C> extends true
								? boolean | null
								: boolean
							: C extends DateFieldSchema
								? IsNullable<C> extends true
									? DateTimeString | null
									: DateTimeString
								: C extends SelectFieldSchema<infer TOptions>
									? IsNullable<C> extends true
										? TOptions[number] | null
										: TOptions[number]
									: C extends TagsFieldSchema<infer TOptions>
										? IsNullable<C> extends true
											? TOptions[number][] | null
											: TOptions[number][]
										: C extends JsonFieldSchema<
													infer TSchema extends StandardSchemaWithJSONSchema
												>
											? IsNullable<C> extends true
												? StandardSchemaV1.InferOutput<TSchema> | null
												: StandardSchemaV1.InferOutput<TSchema>
											: never;

// ============================================================================
// Table Schema Types
// ============================================================================

/**
 * Fields schema - maps field names to field schemas.
 * Must always include an 'id' field with IdFieldSchema.
 *
 * @example
 * ```typescript
 * const postsFields = {
 *   id: id(),
 *   title: text(),
 *   status: select({ options: ['draft', 'published'] }),
 * } satisfies FieldsSchema;
 * ```
 */
export type FieldsSchema = { id: IdFieldSchema } & Record<string, FieldSchema>;

/**
 * Table schema - maps field names to field schemas.
 * Alias for FieldsSchema, used when defining tables.
 */
export type TableSchema = FieldsSchema;

/**
 * Table definition with metadata for UI display.
 * Use this type for the full table definition including metadata.
 *
 * @example
 * ```typescript
 * const postsTable: TableDefinition = {
 *   name: 'Posts',
 *   emoji: '📝',
 *   description: 'Blog posts and articles',
 *   order: 0,
 *   fields: {
 *     id: id(),
 *     title: text(),
 *     status: select({ options: ['draft', 'published'] }),
 *   },
 * };
 * ```
 */
export type TableDefinition<TFields extends FieldsSchema = FieldsSchema> = {
	/** Display name shown in UI (e.g., "Blog Posts") */
	name: string;
	/** Emoji icon (e.g., "📝") */
	emoji: string;
	/** Description shown in tooltips/docs */
	description: string;
	/** Explicit ordering for UI (0, 1, 2...) */
	order: number;
	/** The field schemas for this table */
	fields: TFields;
};

/**
 * Tables schema - maps table keys to table field schemas.
 * This is the simple format for defining tables inline.
 *
 * @example
 * ```typescript
 * const blogTables = {
 *   posts: { id: id(), title: text() },
 *   authors: { id: id(), name: text() },
 * } satisfies TablesSchema;
 * ```
 */
export type TablesSchema = Record<string, TableSchema>;

/**
 * Tables with metadata - maps table keys to full table definitions.
 * Use this when you need table metadata (name, emoji, description, order).
 *
 * @example
 * ```typescript
 * const blogTables: TablesWithMetadata = {
 *   posts: {
 *     name: 'Posts',
 *     emoji: '📝',
 *     description: 'Blog posts',
 *     order: 0,
 *     fields: { id: id(), title: text() },
 *   },
 * };
 * ```
 */
export type TablesWithMetadata = Record<string, TableDefinition>;

// ============================================================================
// Row Types
// ============================================================================

/**
 * Plain object representing a complete table row.
 *
 * Row is the unified type for both reads and writes. All values are plain
 * JSON-serializable primitives (no Y.js types, no methods, no proxy behavior).
 *
 * @example
 * ```typescript
 * // Write: pass a Row to upsert
 * tables.posts.upsert({
 *   id: generateId(),
 *   title: 'Hello World',
 *   published: false,
 * });
 *
 * // Read: get returns a Row (wrapped in RowResult for validation)
 * const result = tables.posts.get({ id: '1' });
 * if (result.status === 'valid') {
 *   const row: Row = result.row;
 *   console.log(row.title);
 * }
 *
 * // Rows are JSON-serializable
 * const json = JSON.stringify(row);
 * ```
 */
export type Row<TFieldsSchema extends FieldsSchema = FieldsSchema> = {
	[K in keyof TFieldsSchema]: CellValue<TFieldsSchema[K]>;
};

/**
 * Partial row for updates. ID is required, all other fields are optional.
 *
 * Use PartialRow with `update()` when you only want to change specific fields
 * without providing the entire row. Fields not included are left unchanged.
 *
 * @example
 * ```typescript
 * // Update only the title, leave other fields unchanged
 * tables.posts.update({ id: '1', title: 'New Title' });
 *
 * // Update multiple fields
 * tables.posts.update({
 *   id: '1',
 *   title: 'Updated',
 *   published: true,
 * });
 * ```
 */
export type PartialRow<TFieldsSchema extends FieldsSchema = FieldsSchema> = {
	id: string;
} & Partial<Omit<Row<TFieldsSchema>, 'id'>>;

// ============================================================================
// Key-Value Schema Types
// ============================================================================

/**
 * Field schema for KV stores (excludes IdFieldSchema).
 * KV entries don't have IDs; they're keyed by string.
 */
export type KvFieldSchema = Exclude<FieldSchema, IdFieldSchema>;

/**
 * KV schema - maps key names to field schemas.
 */
export type KvSchema = Record<string, KvFieldSchema>;

/**
 * Runtime value type for a KV entry.
 */
export type KvValue<C extends KvFieldSchema = KvFieldSchema> = CellValue<C>;
