/**
 * Field factory functions for creating minimal field schemas.
 *
 * Each function returns a minimal schema object with `type` as the discriminant.
 * No redundant JSON Schema fields; derive JSON Schema on-demand for export.
 */

import type { Temporal } from 'temporal-polyfill';
import { DateTimeString } from './datetime';
import type {
	StandardSchemaV1,
	StandardSchemaWithJSONSchema,
} from '../standard/types';
import type {
	BooleanFieldSchema,
	DateFieldSchema,
	FieldsSchema,
	IdFieldSchema,
	IntegerFieldSchema,
	JsonFieldSchema,
	RealFieldSchema,
	RichtextFieldSchema,
	SelectFieldSchema,
	TableDefinition,
	TagsFieldSchema,
	TextFieldSchema,
} from './types';

export function id(): IdFieldSchema {
	return { type: 'id' };
}

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
		type: 'text',
		...(nullable && { nullable: true }),
		...(defaultValue !== undefined && { default: defaultValue }),
	};
}

export function richtext(): RichtextFieldSchema {
	return { type: 'richtext' };
}

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
		type: 'integer',
		...(nullable && { nullable: true }),
		...(defaultValue !== undefined && { default: defaultValue }),
	};
}

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
		type: 'real',
		...(nullable && { nullable: true }),
		...(defaultValue !== undefined && { default: defaultValue }),
	};
}

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
		type: 'boolean',
		...(nullable && { nullable: true }),
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
		type: 'date',
		...(nullable && { nullable: true }),
		...(defaultValue !== undefined && {
			default: DateTimeString.stringify(defaultValue),
		}),
	};
}

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
		type: 'select',
		options,
		...(nullable && { nullable: true }),
		...(defaultValue !== undefined && { default: defaultValue }),
	};
}

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
		type: 'tags',
		...(options && { options }),
		...(nullable && { nullable: true }),
		...(defaultValue !== undefined && {
			default: defaultValue as TOptions[number][],
		}),
	};
}

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
		type: 'json',
		schema,
		...(nullable && { nullable: true }),
		...(defaultValue !== undefined && { default: defaultValue }),
	};
}

/**
 * Helper to define a table with metadata.
 *
 * @example
 * ```typescript
 * const posts = defineTable({
 *   name: 'Posts',
 *   emoji: '📝',
 *   description: 'Blog posts and articles',
 *   order: 0,
 *   fields: {
 *     id: id(),
 *     title: text(),
 *     status: select({ options: ['draft', 'published'] }),
 *   },
 * });
 * ```
 */
export function defineTable<const TFields extends FieldsSchema>(
	definition: TableDefinition<TFields>,
): TableDefinition<TFields> {
	return definition;
}
