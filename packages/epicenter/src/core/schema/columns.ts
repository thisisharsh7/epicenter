/**
 * @fileoverview Column factory functions for schema definitions
 *
 * Provides factory functions for creating column schemas with type-safe options.
 * Each function returns a column schema object that describes the structure and
 * constraints of a database column, including Standard Schema validation.
 *
 * ## Architecture
 *
 * Column schemas are JSON Schema objects with an embedded `~standard` property
 * for Standard Schema compliance. The `withStandard` helper eliminates duplication
 * by deriving the JSON Schema representation from the schema object itself.
 *
 * ## Key Pattern: `withStandard`
 *
 * The `withStandard` helper takes a single object argument with `jsonSchema` and
 * `validate` keys. The `const TJSONSchema` generic ensures literal type inference.
 *
 * ```typescript
 * return withStandard({
 *   jsonSchema: { 'x-component': 'text', type: 'string' },
 *   validate: (value): { value: string } | { issues: ... } => { ... }
 * });
 * ```
 *
 * ## Best Practices
 *
 * - Never pass explicit generics to `withStandard` - types are inferred
 * - Never use type assertions after `withStandard` calls
 * - Use explicit return type annotations on validate functions for proper inference
 * - The `as const` on type variables is necessary (computed before `withStandard`)
 */

import type { DateWithTimezone } from './date-with-timezone';
import { isDateWithTimezoneString } from './date-with-timezone';
import type {
	StandardSchemaV1,
	StandardSchemaWithJSONSchema,
} from './standard-schema';
import type {
	BooleanColumnSchema,
	DateColumnSchema,
	IdColumnSchema,
	IntegerColumnSchema,
	JsonColumnSchema,
	RealColumnSchema,
	SelectColumnSchema,
	TagsColumnSchema,
	TextColumnSchema,
	YtextColumnSchema,
} from './types';

/**
 * Adds Standard Schema compliance to a base schema object.
 *
 * This is the core abstraction for column schema creation. It takes a base schema
 * object (which IS the JSON Schema representation) and a validate function, then
 * returns the complete column schema with `~standard` attached.
 *
 * The JSON Schema is derived directly from the base schema, eliminating duplication.
 *
 * @param options.jsonSchema - The schema properties (x-component, type, default, etc.)
 * @param options.validate - Validation function that returns Result<T>
 * @returns Complete schema with ~standard property
 *
 * @internal Used by all column factory functions
 */
function withStandard<T, const TJSONSchema extends Record<string, unknown>>({
	jsonSchema,
	validate,
}: {
	jsonSchema: TJSONSchema;
	validate: (value: unknown) => StandardSchemaV1.Result<T>;
}) {
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
		} satisfies StandardSchemaWithJSONSchema<T>['~standard'],
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
export function id(): IdColumnSchema {
	return withStandard({
		jsonSchema: { 'x-component': 'id', type: 'string' },
		validate: (
			value,
		): { value: string } | { issues: { message: string; path: never[] }[] } => {
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
}): TextColumnSchema<true>;
export function text(opts?: {
	nullable?: false;
	default?: string;
}): TextColumnSchema<false>;
export function text({
	nullable = false,
	default: defaultValue,
}: {
	nullable?: boolean;
	default?: string;
} = {}): TextColumnSchema<boolean> {
	const type = nullable ? (['string', 'null'] as const) : ('string' as const);
	return withStandard({
		jsonSchema: {
			'x-component': 'text',
			type,
			...(defaultValue !== undefined && { default: defaultValue }),
		},
		validate: (
			value,
		):
			| { value: string | null }
			| { issues: { message: string; path: never[] }[] } => {
			if (nullable && value === null) return { value: null };
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
export function ytext(opts: { nullable: true }): YtextColumnSchema<true>;
export function ytext(opts?: { nullable?: false }): YtextColumnSchema<false>;
export function ytext({
	nullable = false,
}: {
	nullable?: boolean;
} = {}): YtextColumnSchema<boolean> {
	const type = nullable ? (['string', 'null'] as const) : ('string' as const);
	return withStandard({
		jsonSchema: { 'x-component': 'ytext', type },
		validate: (
			value,
		):
			| { value: string | null }
			| { issues: { message: string; path: never[] }[] } => {
			if (nullable && value === null) return { value: null };
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
}): IntegerColumnSchema<true>;
export function integer(opts?: {
	nullable?: false;
	default?: number;
}): IntegerColumnSchema<false>;
export function integer({
	nullable = false,
	default: defaultValue,
}: {
	nullable?: boolean;
	default?: number;
} = {}): IntegerColumnSchema<boolean> {
	const type = nullable ? (['integer', 'null'] as const) : ('integer' as const);
	return withStandard({
		jsonSchema: {
			'x-component': 'integer',
			type,
			...(defaultValue !== undefined && { default: defaultValue }),
		},
		validate: (
			value,
		):
			| { value: number | null }
			| { issues: { message: string; path: never[] }[] } => {
			if (nullable && value === null) return { value: null };
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
}): RealColumnSchema<true>;
export function real(opts?: {
	nullable?: false;
	default?: number;
}): RealColumnSchema<false>;
export function real({
	nullable = false,
	default: defaultValue,
}: {
	nullable?: boolean;
	default?: number;
} = {}): RealColumnSchema<boolean> {
	const type = nullable ? (['number', 'null'] as const) : ('number' as const);
	return withStandard({
		jsonSchema: {
			'x-component': 'real',
			type,
			...(defaultValue !== undefined && { default: defaultValue }),
		},
		validate: (
			value,
		):
			| { value: number | null }
			| { issues: { message: string; path: never[] }[] } => {
			if (nullable && value === null) return { value: null };
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
}): BooleanColumnSchema<true>;
export function boolean(opts?: {
	nullable?: false;
	default?: boolean;
}): BooleanColumnSchema<false>;
export function boolean({
	nullable = false,
	default: defaultValue,
}: {
	nullable?: boolean;
	default?: boolean;
} = {}): BooleanColumnSchema<boolean> {
	const type = nullable ? (['boolean', 'null'] as const) : ('boolean' as const);
	return withStandard({
		jsonSchema: {
			'x-component': 'boolean',
			type,
			...(defaultValue !== undefined && { default: defaultValue }),
		},
		validate: (
			value,
		):
			| { value: boolean | null }
			| { issues: { message: string; path: never[] }[] } => {
			if (nullable && value === null) return { value: null };
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
}): DateColumnSchema<true>;
export function date(opts?: {
	nullable?: false;
	default?: DateWithTimezone;
}): DateColumnSchema<false>;
export function date({
	nullable = false,
	default: defaultValue,
}: {
	nullable?: boolean;
	default?: DateWithTimezone;
} = {}): DateColumnSchema<boolean> {
	const type = nullable ? (['string', 'null'] as const) : ('string' as const);
	return withStandard({
		jsonSchema: {
			'x-component': 'date',
			type,
			format: 'date',
			...(defaultValue !== undefined && { default: defaultValue }),
		},
		validate: (
			value,
		):
			| { value: DateWithTimezone | null }
			| { issues: { message: string; path: never[] }[] } => {
			if (nullable && value === null) return { value: null };
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
}): SelectColumnSchema<TOptions, true>;
export function select<
	const TOptions extends readonly [string, ...string[]],
>(opts: {
	options: TOptions;
	nullable?: false;
	default?: TOptions[number];
}): SelectColumnSchema<TOptions, false>;
export function select<const TOptions extends readonly [string, ...string[]]>({
	options,
	nullable = false,
	default: defaultValue,
}: {
	options: TOptions;
	nullable?: boolean;
	default?: TOptions[number];
}): SelectColumnSchema<TOptions, boolean> {
	const type = nullable ? (['string', 'null'] as const) : ('string' as const);
	return withStandard({
		jsonSchema: {
			'x-component': 'select',
			type,
			enum: options,
			...(defaultValue !== undefined && { default: defaultValue }),
		},
		validate: (
			value,
		):
			| { value: TOptions[number] | null }
			| { issues: { message: string; path: never[] }[] } => {
			if (nullable && value === null) return { value: null };
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
}): TagsColumnSchema<TOptions, true>;
export function tags<
	const TOptions extends readonly [string, ...string[]],
>(opts: {
	options: TOptions;
	nullable?: false;
	default?: TOptions[number][];
}): TagsColumnSchema<TOptions, false>;
export function tags<TNullable extends boolean = false>(opts?: {
	nullable?: TNullable;
	default?: string[];
}): TagsColumnSchema<readonly [string, ...string[]], TNullable>;
export function tags<const TOptions extends readonly [string, ...string[]]>({
	options,
	nullable = false,
	default: defaultValue,
}: {
	options?: TOptions;
	nullable?: boolean;
	default?: TOptions[number][] | string[];
} = {}): TagsColumnSchema<TOptions, boolean> {
	const type = nullable ? (['array', 'null'] as const) : ('array' as const);
	const items = options
		? { type: 'string' as const, enum: options }
		: { type: 'string' as const };
	return withStandard({
		jsonSchema: {
			'x-component': 'tags',
			type,
			items,
			uniqueItems: true,
			...(defaultValue !== undefined && {
				default: defaultValue as TOptions[number][],
			}),
		},
		validate: (
			value,
		):
			| { value: TOptions[number][] | null }
			| { issues: { message: string; path: never[] }[] } => {
			if (nullable && value === null) return { value: null };
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
}): JsonColumnSchema<TSchema, true>;
export function json<const TSchema extends StandardSchemaWithJSONSchema>(opts: {
	schema: TSchema;
	nullable?: false;
	default?: StandardSchemaV1.InferOutput<TSchema>;
}): JsonColumnSchema<TSchema, false>;
export function json<const TSchema extends StandardSchemaWithJSONSchema>({
	schema,
	nullable = false,
	default: defaultValue,
}: {
	schema: TSchema;
	nullable?: boolean;
	default?: StandardSchemaV1.InferOutput<TSchema>;
}): JsonColumnSchema<TSchema, boolean> {
	const type = nullable ? (['object', 'null'] as const) : ('object' as const);
	return withStandard({
		jsonSchema: {
			'x-component': 'json',
			type,
			schema,
			...(defaultValue !== undefined && { default: defaultValue }),
		},
		validate: (
			value,
		):
			| { value: StandardSchemaV1.InferOutput<TSchema> | null }
			| { issues: { message: string; path: never[] }[] } => {
			if (nullable && value === null) return { value: null };
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
