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

import type { Temporal } from 'temporal-polyfill';
import { DATE_TIME_STRING_REGEX } from '../runtime/regex';
import { toDateTimeString } from '../runtime/datetime';
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
	RichtextFieldSchema,
	SelectFieldSchema,
	TagsFieldSchema,
	TextFieldSchema,
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
 * Rich text reference column - stores an ID pointing to a separate rich content document.
 *
 * Unlike `text()` which stores plain strings directly, `richtext()` stores a reference ID
 * (e.g., "rtxt_abc123") that points to a separate Y.Doc for collaborative editing.
 *
 * **Why ID references?**
 * - Keeps rows JSON-serializable (no embedded CRDTs)
 * - Enables proper CRDT conflict resolution for rich text edits
 * - Allows rich content to be backed by different Y.Doc structures (Y.Text, Y.XmlFragment)
 * - Makes rows portable across different storage backends
 *
 * **Usage pattern:**
 * 1. Generate ID with `createRichContentId()` when creating new content
 * 2. Store the ID in the row via `richtext()` column
 * 3. The actual collaborative editing happens in a separate Y.Doc keyed by this ID
 *
 * @example
 * ```typescript
 * const schema = {
 *   id: id(),
 *   title: text(),           // Plain string, edited directly
 *   content: richtext(),     // ID reference to separate Y.Doc for collaborative editing
 * };
 * ```
 */
export function richtext(opts: { nullable: true }): RichtextFieldSchema<true>;
export function richtext(opts?: {
	nullable?: false;
}): RichtextFieldSchema<false>;
export function richtext({
	nullable = false,
}: {
	nullable?: boolean;
} = {}): RichtextFieldSchema<boolean> {
	return {
		'x-component': 'richtext',
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

export function date(opts: {
	nullable: true;
	default?: Temporal.ZonedDateTime;
}): DateFieldSchema<true>;
export function date(opts?: {
	nullable?: false;
	default?: Temporal.ZonedDateTime;
}): DateFieldSchema<false>;
export function date({
	nullable = false,
	default: defaultValue,
}: {
	nullable?: boolean;
	default?: Temporal.ZonedDateTime;
} = {}): DateFieldSchema<boolean> {
	return {
		'x-component': 'date',
		type: nullable ? (['string', 'null'] as const) : ('string' as const),
		description:
			'ISO 8601 date with timezone (e.g., 2024-01-01T20:00:00.000Z|America/New_York)',
		pattern: DATE_TIME_STRING_REGEX.source,
		...(defaultValue !== undefined && {
			default: toDateTimeString(defaultValue),
		}),
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
