/**
 * @fileoverview Field factory functions for schema definitions
 *
 * Provides factory functions for creating field schemas with type-safe options.
 * Each function returns a pure JSON Schema object that describes the structure
 * and constraints of a database field.
 *
 * Validation is handled separately by converters (to-arktype, to-standard)
 * rather than being embedded in the schema.
 */

import type { DateWithTimezone } from '../runtime/date-with-timezone';
import { DATE_WITH_TIMEZONE_STRING_REGEX } from '../runtime/regex';
import type {
	StandardSchemaV1,
	StandardSchemaWithJSONSchema,
} from '../standard/types';
import type {
	BooleanFieldSchema,
	DateFieldSchema,
	IdFieldSchema,
	IntegerFieldSchema,
	JsonFieldSchema,
	RealFieldSchema,
	SelectFieldSchema,
	TagsFieldSchema,
	TextFieldSchema,
	YtextFieldSchema,
} from './types';

/**
 * Creates an ID column schema - always primary key with auto-generation.
 * IDs are always NOT NULL (cannot be nullable).
 */
export function id(): IdFieldSchema {
	return { 'x-component': 'id', type: 'string' };
}

/**
 * Creates a text column schema (NOT NULL by default).
 */
export function text(opts: {
	nullable: true;
	default?: string;
}): TextFieldSchema<true>;
export function text(opts?: {
	nullable?: false;
	default?: string;
}): TextFieldSchema<false>;
export function text({
	nullable = false,
	default: defaultValue,
}: {
	nullable?: boolean;
	default?: string;
} = {}): TextFieldSchema<boolean> {
	return {
		'x-component': 'text',
		type: nullable ? (['string', 'null'] as const) : ('string' as const),
		...(defaultValue !== undefined && { default: defaultValue }),
	};
}

/**
 * Collaborative text editor column - stored as Y.Text (YJS shared type).
 *
 * Y.Text is a flat/linear text structure that supports inline formatting.
 * Primary use case: Code editors (Monaco, CodeMirror) with syntax highlighting.
 *
 * **What Y.Text supports:**
 * - Inline formatting: bold, italic, underline, links, colors
 * - No block-level structure (no paragraphs, lists, or tables)
 *
 * **Common editor bindings:**
 * - CodeMirror, Monaco Editor (code editing) - PRIMARY USE CASE
 * - Quill (simple WYSIWYG with inline formatting)
 *
 * For block-level rich text (paragraphs, lists, tables), use Y.XmlFragment instead.
 */
export function ytext(opts: { nullable: true }): YtextFieldSchema<true>;
export function ytext(opts?: { nullable?: false }): YtextFieldSchema<false>;
export function ytext({
	nullable = false,
}: {
	nullable?: boolean;
} = {}): YtextFieldSchema<boolean> {
	return {
		'x-component': 'ytext',
		type: nullable ? (['string', 'null'] as const) : ('string' as const),
	};
}

/**
 * Creates an integer column schema (NOT NULL by default).
 */
export function integer(opts: {
	nullable: true;
	default?: number;
}): IntegerFieldSchema<true>;
export function integer(opts?: {
	nullable?: false;
	default?: number;
}): IntegerFieldSchema<false>;
export function integer({
	nullable = false,
	default: defaultValue,
}: {
	nullable?: boolean;
	default?: number;
} = {}): IntegerFieldSchema<boolean> {
	return {
		'x-component': 'integer',
		type: nullable ? (['integer', 'null'] as const) : ('integer' as const),
		...(defaultValue !== undefined && { default: defaultValue }),
	};
}

/**
 * Creates a real/float column schema (NOT NULL by default).
 */
export function real(opts: {
	nullable: true;
	default?: number;
}): RealFieldSchema<true>;
export function real(opts?: {
	nullable?: false;
	default?: number;
}): RealFieldSchema<false>;
export function real({
	nullable = false,
	default: defaultValue,
}: {
	nullable?: boolean;
	default?: number;
} = {}): RealFieldSchema<boolean> {
	return {
		'x-component': 'real',
		type: nullable ? (['number', 'null'] as const) : ('number' as const),
		...(defaultValue !== undefined && { default: defaultValue }),
	};
}

/**
 * Creates a boolean column schema (NOT NULL by default).
 */
export function boolean(opts: {
	nullable: true;
	default?: boolean;
}): BooleanFieldSchema<true>;
export function boolean(opts?: {
	nullable?: false;
	default?: boolean;
}): BooleanFieldSchema<false>;
export function boolean({
	nullable = false,
	default: defaultValue,
}: {
	nullable?: boolean;
	default?: boolean;
} = {}): BooleanFieldSchema<boolean> {
	return {
		'x-component': 'boolean',
		type: nullable ? (['boolean', 'null'] as const) : ('boolean' as const),
		...(defaultValue !== undefined && { default: defaultValue }),
	};
}

/**
 * Creates a date with timezone column schema (NOT NULL by default).
 */
export function date(opts: {
	nullable: true;
	default?: DateWithTimezone;
}): DateFieldSchema<true>;
export function date(opts?: {
	nullable?: false;
	default?: DateWithTimezone;
}): DateFieldSchema<false>;
export function date({
	nullable = false,
	default: defaultValue,
}: {
	nullable?: boolean;
	default?: DateWithTimezone;
} = {}): DateFieldSchema<boolean> {
	return {
		'x-component': 'date',
		type: nullable ? (['string', 'null'] as const) : ('string' as const),
		description:
			'ISO 8601 date with timezone (e.g., 2024-01-01T20:00:00.000Z|America/New_York)',
		pattern: DATE_WITH_TIMEZONE_STRING_REGEX.source,
		...(defaultValue !== undefined && { default: defaultValue }),
	};
}

/**
 * Creates a select/enum column schema for single choice from predefined options.
 */
export function select<
	const TOptions extends readonly [string, ...string[]],
>(opts: {
	options: TOptions;
	nullable: true;
	default?: TOptions[number];
}): SelectFieldSchema<TOptions, true>;
export function select<
	const TOptions extends readonly [string, ...string[]],
>(opts: {
	options: TOptions;
	nullable?: false;
	default?: TOptions[number];
}): SelectFieldSchema<TOptions, false>;
export function select<const TOptions extends readonly [string, ...string[]]>({
	options,
	nullable = false,
	default: defaultValue,
}: {
	options: TOptions;
	nullable?: boolean;
	default?: TOptions[number];
}): SelectFieldSchema<TOptions, boolean> {
	return {
		'x-component': 'select',
		type: nullable ? (['string', 'null'] as const) : ('string' as const),
		enum: options,
		...(defaultValue !== undefined && { default: defaultValue }),
	};
}

/**
 * Creates a tags column schema for storing arrays of strings.
 * With options: validated against allowed values. Without options: any string array.
 */
export function tags<
	const TOptions extends readonly [string, ...string[]],
>(opts: {
	options: TOptions;
	nullable: true;
	default?: TOptions[number][];
}): TagsFieldSchema<TOptions, true>;
export function tags<
	const TOptions extends readonly [string, ...string[]],
>(opts: {
	options: TOptions;
	nullable?: false;
	default?: TOptions[number][];
}): TagsFieldSchema<TOptions, false>;
export function tags<TNullable extends boolean = false>(opts?: {
	nullable?: TNullable;
	default?: string[];
}): TagsFieldSchema<readonly [string, ...string[]], TNullable>;
export function tags<const TOptions extends readonly [string, ...string[]]>({
	options,
	nullable = false,
	default: defaultValue,
}: {
	options?: TOptions;
	nullable?: boolean;
	default?: TOptions[number][] | string[];
} = {}): TagsFieldSchema<TOptions, boolean> {
	return {
		'x-component': 'tags',
		type: nullable ? (['array', 'null'] as const) : ('array' as const),
		items: options
			? { type: 'string' as const, enum: options }
			: { type: 'string' as const },
		uniqueItems: true,
		...(defaultValue !== undefined && {
			default: defaultValue as TOptions[number][],
		}),
	};
}

/**
 * Creates a JSON column schema with Standard Schema validation.
 *
 * The `schema` property holds a Standard Schema (ArkType, Zod v4.2+, Valibot)
 * that validates the JSON value.
 *
 * **JSON Schema Compatibility Warning**: When used in action inputs, schemas are
 * converted to JSON Schema for MCP/OpenAPI. Only use features representable in JSON Schema:
 * - ✅ Basic types, objects, arrays, enums, patterns (regex)
 * - ❌ Transforms: `.pipe()`, `.transform()`
 * - ❌ Custom predicates: `.filter()`, `.refine()`
 * - ❌ Non-JSON types: `bigint`, `symbol`, `Date`, `Map`, `Set`
 */
export function json<const TSchema extends StandardSchemaWithJSONSchema>(opts: {
	schema: TSchema;
	nullable: true;
	default?: StandardSchemaV1.InferOutput<TSchema>;
}): JsonFieldSchema<TSchema, true>;
export function json<const TSchema extends StandardSchemaWithJSONSchema>(opts: {
	schema: TSchema;
	nullable?: false;
	default?: StandardSchemaV1.InferOutput<TSchema>;
}): JsonFieldSchema<TSchema, false>;
export function json<const TSchema extends StandardSchemaWithJSONSchema>({
	schema,
	nullable = false,
	default: defaultValue,
}: {
	schema: TSchema;
	nullable?: boolean;
	default?: StandardSchemaV1.InferOutput<TSchema>;
}): JsonFieldSchema<TSchema, boolean> {
	return {
		'x-component': 'json',
		type: nullable ? (['object', 'null'] as const) : ('object' as const),
		schema,
		...(defaultValue !== undefined && { default: defaultValue }),
	};
}
