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
	FieldSchemaMap,
	IconDefinition,
	IdFieldSchema,
	IntegerFieldSchema,
	JsonFieldSchema,
	KvDefinition,
	KvFieldSchema,
	RealFieldSchema,
	RichtextFieldSchema,
	SelectFieldSchema,
	TableDefinition,
	TagsFieldSchema,
	TextFieldSchema,
} from './types';

/**
 * Normalize icon input to canonical IconDefinition | null.
 */
function normalizeIcon(
	icon: string | IconDefinition | null | undefined,
): IconDefinition | null {
	if (icon === undefined || icon === null) return null;
	if (typeof icon === 'string') return { type: 'emoji', value: icon };
	return icon;
}

/**
 * Factory function to create a TableDefinition.
 *
 * `name` and `fields` are required. `description` and `icon` are optional:
 * - `name`: Required display name for the table.
 * - `fields`: Required field schema map.
 * - `description`: Optional. Defaults to empty string.
 * - `icon`: Optional. Accepts string shorthand ('📝'), IconDefinition, or null. Defaults to null.
 *
 * @example
 * ```typescript
 * // Minimal - name and fields required
 * const posts = table({
 *   name: 'Posts',
 *   fields: { id: id(), title: text(), published: boolean() },
 * });
 *
 * // With icon shorthand
 * const posts = table({
 *   name: 'Posts',
 *   icon: '📝',
 *   fields: { id: id(), title: text() },
 * });
 *
 * // Full - all metadata explicit
 * const posts = table({
 *   name: 'Blog Posts',
 *   description: 'Articles and blog posts',
 *   icon: '📝',
 *   fields: { id: id(), title: text(), published: boolean() },
 * });
 *
 * // In defineWorkspace
 * defineWorkspace({
 *   id: 'blog',
 *   tables: {
 *     posts: table({ name: 'Posts', fields: { id: id(), title: text() } }),
 *   },
 *   kv: {},
 * });
 * ```
 */
export function table<TFields extends FieldSchemaMap>(options: {
	name: string;
	fields: TFields;
	description?: string;
	icon?: string | IconDefinition | null;
}): TableDefinition<TFields> {
	return {
		name: options.name,
		description: options.description ?? '',
		icon: normalizeIcon(options.icon),
		fields: options.fields,
	};
}

/**
 * Factory function to create a KvDefinition (setting) with sensible defaults.
 *
 * Requires `name` and `field`; other metadata is optional.
 * For tests where you don't care about the name, use `name: ''`.
 *
 * Conceptually, a KV store is like a single table row where each key is a column.
 * While TableDefinition wraps a map of fields, KvDefinition wraps a single field.
 *
 * @example
 * ```typescript
 * import { setting, icon, select, integer } from '@epicenter/hq';
 *
 * // Production use - with meaningful metadata
 * const theme = setting({
 *   name: 'Theme',
 *   icon: icon.emoji('🎨'),
 *   field: select({ options: ['light', 'dark'], default: 'light' }),
 *   description: 'Application color theme',
 * });
 *
 * // Test use - minimal
 * const count = setting({
 *   name: '',
 *   field: integer({ default: 0 }),
 * });
 * ```
 */
export function setting<TField extends KvFieldSchema>(options: {
	name: string;
	field: TField;
	icon?: IconDefinition | null;
	description?: string;
}): KvDefinition<TField> {
	return {
		name: options.name,
		icon: options.icon ?? null,
		description: options.description ?? '',
		field: options.field,
	};
}

/**
 * Factory functions for creating IconDefinition objects.
 *
 * Icons can be emoji characters or external image URLs.
 * Use these helpers instead of manually constructing icon objects.
 *
 * @example
 * ```typescript
 * import { table, icon } from '@epicenter/hq';
 *
 * const posts = table({
 *   name: 'Posts',
 *   icon: icon.emoji('📝'),
 *   fields: { id: id(), title: text() },
 * });
 *
 * const settings = table({
 *   name: 'Settings',
 *   icon: icon.external('https://example.com/icon.png'),
 *   fields: { id: id(), key: text() },
 * });
 * ```
 */
export const icon = {
	/**
	 * Create an emoji icon.
	 *
	 * @param value - The emoji character to use as the icon
	 * @returns An emoji icon definition
	 *
	 * @example
	 * ```typescript
	 * icon.emoji('📝')  // { type: 'emoji', value: '📝' }
	 * icon.emoji('🚀')  // { type: 'emoji', value: '🚀' }
	 * ```
	 */
	emoji: (value: string) =>
		({ type: 'emoji', value }) as const satisfies IconDefinition,

	/**
	 * Create an external image icon.
	 *
	 * @param url - The URL of the external image
	 * @returns An external icon definition
	 *
	 * @example
	 * ```typescript
	 * icon.external('https://example.com/icon.png')
	 * ```
	 */
	external: (url: string) =>
		({ type: 'external', url }) as const satisfies IconDefinition,
};

/**
 * Factory functions for creating CoverDefinition objects.
 *
 * @deprecated Cover has been removed from TableDefinition.
 * This factory is kept for backward compatibility but will be removed in a future version.
 */
export const cover = {
	/**
	 * Create an external image cover.
	 *
	 * @deprecated Cover has been removed from TableDefinition.
	 *
	 * @param url - The URL of the external cover image
	 * @returns An external cover definition
	 */
	external: (url: string) =>
		({ type: 'external', url }) as const satisfies CoverDefinition,
};

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
