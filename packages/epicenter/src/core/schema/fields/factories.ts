/**
 * @fileoverview Field factory functions for schema definitions
 *
 * Provides factory functions for creating field schemas with type-safe options.
 * Each function returns a field schema object that describes the structure and
 * constraints of a database field, including Standard Schema validation.
 *
 * ## Architecture
 *
 * Field schemas are JSON Schema objects with an embedded `~standard` property
 * for Standard Schema compliance. The `createFieldSchema` helper eliminates duplication
 * by deriving the JSON Schema representation from the schema object itself.
 *
 * ## Key Pattern: `createFieldSchema`
 *
 * Uses two positional arguments for better TypeScript inference:
 * - First arg: JSON schema object (literal types preserved via `const TJSONSchema`)
 * - Second arg: validate function (output type inferred via `TValidate`)
 *
 * ```typescript
 * return createFieldSchema(
 *   { 'x-component': 'text', type: 'string' },
 *   (value) => {
 *     if (typeof value !== 'string') return { issues: [...] };
 *     return { value };
 *   }
 * );
 * ```
 */

import type { DateWithTimezone } from '../runtime/date-with-timezone';
import { isDateWithTimezoneString } from '../runtime/date-with-timezone';
import { DATE_WITH_TIMEZONE_STRING_REGEX } from '../runtime/regex';
import type {
	StandardJSONSchemaV1,
	StandardSchemaV1,
	StandardSchemaWithJSONSchema,
} from '../standard/types';
import type {
	BooleanFieldSchema,
	FieldComponent,
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

type FieldStandard<T> = {
	'~standard': StandardSchemaV1.Props<T> & StandardJSONSchemaV1.Props<T>;
};

/**
 * Attaches Standard Schema `~standard` metadata to a JSON Schema object.
 *
 * Two positional arguments for optimal TypeScript inference:
 * - `jsonSchema`: Literal types preserved via `const TJSONSchema`
 * - `validate`: Output type inferred directly from validate function's return type
 *
 * The key insight: `TOutput` is a direct generic that TypeScript infers from the
 * validate callback's `{ value }` return, avoiding the inference issues that occur
 * when extracting from a constrained function type.
 *
 * @internal Used by all column factory functions
 */
function createFieldSchema<
	const TJSONSchema extends {
		'x-component': FieldComponent;
		type: string | readonly string[];
	},
	TOutput,
>({
	jsonSchema,
	validate,
}: {
	jsonSchema: TJSONSchema;
	validate: (value: unknown) => StandardSchemaV1.Result<TOutput>;
}): TJSONSchema & FieldStandard<TOutput> {
	return {
		...jsonSchema,
		'~standard': {
			version: 1,
			vendor: 'epicenter',
			validate,
			jsonSchema: {
				input: () => jsonSchema,
				output: () => jsonSchema,
			},
		} satisfies FieldStandard<TOutput>['~standard'],
	};
}

/**
 * Creates an ID column schema - always primary key with auto-generation.
 * IDs are always NOT NULL (cannot be nullable).
 *
 * @example
 * ```typescript
 * id() // → { 'x-component': 'id', type: 'string', ... }
 * ```
 */
export function id(): IdFieldSchema {
	return createFieldSchema({
		jsonSchema: { 'x-component': 'id', type: 'string' },
		validate: (value): StandardSchemaV1.Result<string> => {
			if (typeof value !== 'string') {
				return { issues: [{ message: 'Expected string', path: [] }] };
			}
			return { value };
		},
	});
}

/**
 * Creates a text column schema (NOT NULL by default).
 *
 * @example
 * ```typescript
 * text()                        // NOT NULL text
 * text({ nullable: true })      // Nullable text
 * text({ default: 'unnamed' })  // NOT NULL with default
 * ```
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
	return createFieldSchema({
		jsonSchema: {
			'x-component': 'text',
			type: nullable ? (['string', 'null'] as const) : ('string' as const),
			...(defaultValue !== undefined && { default: defaultValue }),
		},
		validate: (value): StandardSchemaV1.Result<string | null> => {
			if (nullable && value === null) return { value };
			if (typeof value !== 'string') {
				return { issues: [{ message: 'Expected string', path: [] }] };
			}
			return { value };
		},
	});
}

/**
 * Collaborative text editor column - stored as Y.Text (YJS shared type).
 *
 * Y.Text is a flat/linear text structure that supports inline formatting.
 * **Primary use case: Code editors** (Monaco, CodeMirror) with syntax highlighting.
 * Also works for: simple rich text (Quill), formatted comments, chat messages.
 *
 * **What Y.Text supports:**
 * - Inline formatting: bold, italic, underline, links, colors
 * - No block-level structure (no paragraphs, lists, or tables)
 *
 * **Most common editor bindings:**
 * - CodeMirror (code editing) - PRIMARY USE CASE
 * - Monaco Editor (code editing) - PRIMARY USE CASE
 * - Quill (simple WYSIWYG with inline formatting)
 *
 * **Common use cases:**
 * - SQL/JavaScript/Python code editors with syntax highlighting
 * - Code snippets in documentation
 * - Formatted comments or chat messages
 *
 * @example
 * ```typescript
 * query: ytext()                  // Y.Text for storing SQL queries
 * snippet: ytext()                // Y.Text for code examples
 * comment: ytext({ nullable: true }) // Optional collaborative text
 * ```
 */
export function ytext(opts: { nullable: true }): YtextFieldSchema<true>;
export function ytext(opts?: { nullable?: false }): YtextFieldSchema<false>;
export function ytext({
	nullable = false,
}: {
	nullable?: boolean;
} = {}): YtextFieldSchema<boolean> {
	return createFieldSchema({
		jsonSchema: {
			'x-component': 'ytext',
			type: nullable ? (['string', 'null'] as const) : ('string' as const),
		},
		validate: (value): StandardSchemaV1.Result<string | null> => {
			if (nullable && value === null) return { value };
			if (typeof value !== 'string') {
				return { issues: [{ message: 'Expected string', path: [] }] };
			}
			return { value };
		},
	});
}

/**
 * Creates an integer column schema (NOT NULL by default).
 *
 * @example
 * ```typescript
 * integer()               // NOT NULL integer
 * integer({ default: 0 }) // NOT NULL with default
 * integer({ nullable: true })
 * ```
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
	return createFieldSchema({
		jsonSchema: {
			'x-component': 'integer',
			type: nullable ? (['integer', 'null'] as const) : ('integer' as const),
			...(defaultValue !== undefined && { default: defaultValue }),
		},
		validate: (value): StandardSchemaV1.Result<number | null> => {
			if (nullable && value === null) return { value };
			if (typeof value !== 'number' || !Number.isInteger(value)) {
				return { issues: [{ message: 'Expected integer', path: [] }] };
			}
			return { value };
		},
	});
}

/**
 * Creates a real/float column schema (NOT NULL by default).
 *
 * @example
 * ```typescript
 * real()                 // NOT NULL float
 * real({ default: 0.0 }) // NOT NULL with default
 * real({ nullable: true })
 * ```
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
	return createFieldSchema({
		jsonSchema: {
			'x-component': 'real',
			type: nullable ? (['number', 'null'] as const) : ('number' as const),
			...(defaultValue !== undefined && { default: defaultValue }),
		},
		validate: (value): StandardSchemaV1.Result<number | null> => {
			if (nullable && value === null) return { value };
			if (typeof value !== 'number') {
				return { issues: [{ message: 'Expected number', path: [] }] };
			}
			return { value };
		},
	});
}

/**
 * Creates a boolean column schema (NOT NULL by default).
 *
 * @example
 * ```typescript
 * boolean()                  // NOT NULL boolean
 * boolean({ default: false }) // NOT NULL with default
 * boolean({ nullable: true })
 * ```
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
	return createFieldSchema({
		jsonSchema: {
			'x-component': 'boolean',
			type: nullable ? (['boolean', 'null'] as const) : ('boolean' as const),
			...(defaultValue !== undefined && { default: defaultValue }),
		},
		validate: (value): StandardSchemaV1.Result<boolean | null> => {
			if (nullable && value === null) return { value };
			if (typeof value !== 'boolean') {
				return { issues: [{ message: 'Expected boolean', path: [] }] };
			}
			return { value };
		},
	});
}

/**
 * Creates a date with timezone column schema (NOT NULL by default).
 *
 * Uses DateWithTimezone format for timezone-aware date storage.
 *
 * @example
 * ```typescript
 * date()                   // NOT NULL date
 * date({ nullable: true }) // Nullable date
 * date({ default: DateWithTimezone({ date: new Date('2025-01-01'), timezone: 'UTC' }) })
 * ```
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
	return createFieldSchema({
		jsonSchema: {
			'x-component': 'date',
			type: nullable ? (['string', 'null'] as const) : ('string' as const),
			description:
				'ISO 8601 date with timezone (e.g., 2024-01-01T20:00:00.000Z|America/New_York)',
			pattern: DATE_WITH_TIMEZONE_STRING_REGEX.source,
			...(defaultValue !== undefined && { default: defaultValue }),
		},
		validate: (value): StandardSchemaV1.Result<string | null> => {
			if (nullable && value === null) return { value };
			if (typeof value !== 'string' || !isDateWithTimezoneString(value)) {
				return { issues: [{ message: 'Expected date string', path: [] }] };
			}
			return { value };
		},
	});
}

/**
 * Creates a select/enum column schema for single choice from predefined options.
 *
 * @example
 * ```typescript
 * select({ options: ['draft', 'published', 'archived'] })
 * select({ options: ['low', 'medium', 'high'], default: 'medium' })
 * select({ options: ['public', 'private'], nullable: true })
 * ```
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
	return createFieldSchema({
		jsonSchema: {
			'x-component': 'select',
			type: nullable ? (['string', 'null'] as const) : ('string' as const),
			enum: options,
			...(defaultValue !== undefined && { default: defaultValue }),
		},
		validate: (value): StandardSchemaV1.Result<TOptions[number] | null> => {
			if (nullable && value === null) return { value };
			if (
				typeof value !== 'string' ||
				!options.includes(value as TOptions[number])
			) {
				return {
					issues: [
						{ message: `Expected one of: ${options.join(', ')}`, path: [] },
					],
				};
			}
			return { value: value as TOptions[number] };
		},
	});
}

/**
 * Creates a tags column schema for storing arrays of strings.
 *
 * Two modes:
 * 1. With options (validated): Only values from the options array are allowed
 * 2. Without options (unconstrained): Any string array is allowed
 *
 * @example
 * ```typescript
 * // Validated tags (with options)
 * tags({ options: ['urgent', 'normal', 'low'] })
 * tags({ options: ['typescript', 'javascript', 'python'], default: ['typescript'] })
 *
 * // Unconstrained tags (without options)
 * tags()                   // Any string array
 * tags({ nullable: true })
 * tags({ default: ['initial', 'tags'] })
 * ```
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
	return createFieldSchema({
		jsonSchema: {
			'x-component': 'tags',
			type: nullable ? (['array', 'null'] as const) : ('array' as const),
			items: options
				? { type: 'string' as const, enum: options }
				: { type: 'string' as const },
			uniqueItems: true,
			...(defaultValue !== undefined && {
				default: defaultValue as TOptions[number][],
			}),
		},
		validate: (value): StandardSchemaV1.Result<TOptions[number][] | null> => {
			if (nullable && value === null) return { value };
			if (!Array.isArray(value)) {
				return { issues: [{ message: 'Expected array', path: [] }] };
			}
			if (options) {
				for (const item of value) {
					if (!options.includes(item as TOptions[number])) {
						return {
							issues: [{ message: `Invalid tag: ${item}`, path: [] }],
						};
					}
				}
			}
			return { value: value as TOptions[number][] };
		},
	});
}

/**
 * Creates a JSON column schema with Standard Schema validation.
 *
 * JSON columns store arbitrary JSON-serializable values validated against any
 * Standard Schema compliant schema (ArkType, Zod v4.2+, Valibot with adapter).
 * The `schema` property is always required.
 *
 * **JSON Schema Compatibility Warning**: When used in action inputs (mutations, queries),
 * these schemas are converted to JSON Schema for MCP/OpenAPI. Only use features that
 * can be represented in JSON Schema:
 * - ✅ Basic types, objects, arrays, enums
 * - ✅ Pattern matching (regex)
 * - ❌ Custom predicates/refinements
 * - ❌ Transforms
 *
 * @example
 * ```typescript
 * import { json } from '@epicenter/hq';
 * import { type } from 'arktype';
 *
 * // Simple object (ArkType)
 * const prefs = json({
 *   schema: type({ theme: 'string', darkMode: 'boolean' }),
 * });
 *
 * // Nullable with default
 * const metadata = json({
 *   schema: type({ key: 'string', value: 'string' }).array(),
 *   nullable: true,
 *   default: [],
 * });
 * ```
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
	return createFieldSchema({
		jsonSchema: {
			'x-component': 'json',
			type: nullable ? (['object', 'null'] as const) : ('object' as const),
			schema,
			...(defaultValue !== undefined && { default: defaultValue }),
		},
		validate: (
			value,
		): StandardSchemaV1.Result<StandardSchemaV1.InferOutput<TSchema> | null> => {
			if (nullable && value === null) return { value };
			const result = schema['~standard'].validate(value);
			if ('issues' in result && result.issues) {
				return {
					issues: result.issues as { message: string; path: never[] }[],
				};
			}
			return {
				value: (result as { value: unknown })
					.value as StandardSchemaV1.InferOutput<TSchema>,
			};
		},
	});
}
