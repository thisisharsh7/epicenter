/**
 * Field factory functions for creating minimal field schemas.
 *
 * Each function returns a minimal schema object with `type` as the discriminant.
 * No redundant JSON Schema fields; derive JSON Schema on-demand for export.
 */

import type { Temporal } from 'temporal-polyfill';
import type { Static, TSchema } from 'typebox';
import { DateTimeString } from './datetime';
import type {
	BooleanFieldSchema,
	CoverDefinition,
	DateFieldSchema,
	FieldOptions,
	FieldsSchema,
	IconDefinition,
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

/**
 * Factory function to create a TableDefinition with sensible defaults.
 *
 * Requires `name` and `fields`; other metadata is optional.
 * For tests where you don't care about the name, use `name: ''`.
 *
 * @example
 * ```typescript
 * // Production use - with meaningful name
 * const posts = table({
 *   name: 'Blog Posts',
 *   fields: { id: id(), title: text(), published: boolean() },
 *   description: 'Articles and blog posts',
 * });
 *
 * // Test use - minimal
 * const posts = table({
 *   name: '',
 *   fields: { id: id(), title: text() },
 * });
 * ```
 */
export function table<TFields extends FieldsSchema>(options: {
	name: string;
	fields: TFields;
	icon?: IconDefinition | null;
	cover?: CoverDefinition | null;
	description?: string;
}): TableDefinition<TFields> {
	return {
		name: options.name,
		icon: options.icon ?? null,
		cover: options.cover ?? null,
		description: options.description ?? '',
		fields: options.fields,
	};
}

export function id({
	name = '',
	description = '',
	icon = null,
}: FieldOptions = {}): IdFieldSchema {
	return {
		type: 'id',
		name,
		description,
		icon,
	};
}

export function text(
	opts: FieldOptions & {
		nullable: true;
		default?: string;
	},
): TextFieldSchema<true>;
export function text(
	opts?: FieldOptions & {
		nullable?: false;
		default?: string;
	},
): TextFieldSchema<false>;
export function text({
	nullable = false,
	default: defaultValue,
	name = '',
	description = '',
	icon = null,
}: FieldOptions & {
	nullable?: boolean;
	default?: string;
} = {}): TextFieldSchema<boolean> {
	return {
		type: 'text',
		name,
		description,
		icon,
		...(nullable && { nullable: true }),
		...(defaultValue !== undefined && { default: defaultValue }),
	};
}

export function richtext({
	name = '',
	description = '',
	icon = null,
}: FieldOptions = {}): RichtextFieldSchema {
	return {
		type: 'richtext',
		name,
		description,
		icon,
	};
}

export function integer(
	opts: FieldOptions & {
		nullable: true;
		default?: number;
	},
): IntegerFieldSchema<true>;
export function integer(
	opts?: FieldOptions & {
		nullable?: false;
		default?: number;
	},
): IntegerFieldSchema<false>;
export function integer({
	nullable = false,
	default: defaultValue,
	name = '',
	description = '',
	icon = null,
}: FieldOptions & {
	nullable?: boolean;
	default?: number;
} = {}): IntegerFieldSchema<boolean> {
	return {
		type: 'integer',
		name,
		description,
		icon,
		...(nullable && { nullable: true }),
		...(defaultValue !== undefined && { default: defaultValue }),
	};
}

export function real(
	opts: FieldOptions & {
		nullable: true;
		default?: number;
	},
): RealFieldSchema<true>;
export function real(
	opts?: FieldOptions & {
		nullable?: false;
		default?: number;
	},
): RealFieldSchema<false>;
export function real({
	nullable = false,
	default: defaultValue,
	name = '',
	description = '',
	icon = null,
}: FieldOptions & {
	nullable?: boolean;
	default?: number;
} = {}): RealFieldSchema<boolean> {
	return {
		type: 'real',
		name,
		description,
		icon,
		...(nullable && { nullable: true }),
		...(defaultValue !== undefined && { default: defaultValue }),
	};
}

export function boolean(
	opts: FieldOptions & {
		nullable: true;
		default?: boolean;
	},
): BooleanFieldSchema<true>;
export function boolean(
	opts?: FieldOptions & {
		nullable?: false;
		default?: boolean;
	},
): BooleanFieldSchema<false>;
export function boolean({
	nullable = false,
	default: defaultValue,
	name = '',
	description = '',
	icon = null,
}: FieldOptions & {
	nullable?: boolean;
	default?: boolean;
} = {}): BooleanFieldSchema<boolean> {
	return {
		type: 'boolean',
		name,
		description,
		icon,
		...(nullable && { nullable: true }),
		...(defaultValue !== undefined && { default: defaultValue }),
	};
}

export function date(
	opts: FieldOptions & {
		nullable: true;
		default?: Temporal.ZonedDateTime;
	},
): DateFieldSchema<true>;
export function date(
	opts?: FieldOptions & {
		nullable?: false;
		default?: Temporal.ZonedDateTime;
	},
): DateFieldSchema<false>;
export function date({
	nullable = false,
	default: defaultValue,
	name = '',
	description = '',
	icon = null,
}: FieldOptions & {
	nullable?: boolean;
	default?: Temporal.ZonedDateTime;
} = {}): DateFieldSchema<boolean> {
	return {
		type: 'date',
		name,
		description,
		icon,
		...(nullable && { nullable: true }),
		...(defaultValue !== undefined && {
			default: DateTimeString.stringify(defaultValue),
		}),
	};
}

export function select<const TOptions extends readonly [string, ...string[]]>(
	opts: FieldOptions & {
		options: TOptions;
		nullable: true;
		default?: TOptions[number];
	},
): SelectFieldSchema<TOptions, true>;
export function select<const TOptions extends readonly [string, ...string[]]>(
	opts: FieldOptions & {
		options: TOptions;
		nullable?: false;
		default?: TOptions[number];
	},
): SelectFieldSchema<TOptions, false>;
export function select<const TOptions extends readonly [string, ...string[]]>({
	options,
	nullable = false,
	default: defaultValue,
	name = '',
	description = '',
	icon = null,
}: FieldOptions & {
	options: TOptions;
	nullable?: boolean;
	default?: TOptions[number];
}): SelectFieldSchema<TOptions, boolean> {
	return {
		type: 'select',
		name,
		description,
		icon,
		options,
		...(nullable && { nullable: true }),
		...(defaultValue !== undefined && { default: defaultValue }),
	};
}

export function tags<const TOptions extends readonly [string, ...string[]]>(
	opts: FieldOptions & {
		options: TOptions;
		nullable: true;
		default?: TOptions[number][];
	},
): TagsFieldSchema<TOptions, true>;
export function tags<const TOptions extends readonly [string, ...string[]]>(
	opts: FieldOptions & {
		options: TOptions;
		nullable?: false;
		default?: TOptions[number][];
	},
): TagsFieldSchema<TOptions, false>;
export function tags<TNullable extends boolean = false>(
	opts?: FieldOptions & {
		nullable?: TNullable;
		default?: string[];
	},
): TagsFieldSchema<readonly [string, ...string[]], TNullable>;
export function tags<const TOptions extends readonly [string, ...string[]]>({
	options,
	nullable = false,
	default: defaultValue,
	name = '',
	description = '',
	icon = null,
}: FieldOptions & {
	options?: TOptions;
	nullable?: boolean;
	default?: TOptions[number][] | string[];
} = {}): TagsFieldSchema<TOptions, boolean> {
	return {
		type: 'tags',
		name,
		description,
		icon,
		...(options && { options }),
		...(nullable && { nullable: true }),
		...(defaultValue !== undefined && {
			default: defaultValue as TOptions[number][],
		}),
	};
}

export function json<const T extends TSchema>(
	opts: FieldOptions & {
		schema: T;
		nullable: true;
		default?: Static<T>;
	},
): JsonFieldSchema<T, true>;
export function json<const T extends TSchema>(
	opts: FieldOptions & {
		schema: T;
		nullable?: false;
		default?: Static<T>;
	},
): JsonFieldSchema<T, false>;
export function json<const T extends TSchema>({
	schema,
	nullable = false,
	default: defaultValue,
	name = '',
	description = '',
	icon = null,
}: FieldOptions & {
	schema: T;
	nullable?: boolean;
	default?: Static<T>;
}): JsonFieldSchema<T, boolean> {
	return {
		type: 'json',
		name,
		description,
		icon,
		schema,
		...(nullable && { nullable: true }),
		...(defaultValue !== undefined && { default: defaultValue }),
	};
}
