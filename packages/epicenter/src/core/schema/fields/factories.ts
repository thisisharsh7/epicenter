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
	BooleanField,
	DateField,
	FieldMap,
	FieldOptions,
	Icon,
	IdField,
	IntegerField,
	JsonField,
	KvDefinition,
	KvField,
	RealField,
	RichtextField,
	SelectField,
	TableDefinition,
	TagsField,
	TextField,
} from './types';
import { isIcon } from './types';

/**
 * Normalize icon input to Icon | null.
 *
 * Accepts:
 * - Icon string (tagged format) → unchanged
 * - Plain emoji string → converted to 'emoji:{value}'
 * - null/undefined → null
 */
function normalizeIcon(icon: string | Icon | null | undefined): Icon | null {
	if (icon === undefined || icon === null) return null;
	if (isIcon(icon)) return icon;
	// Plain string (emoji) → convert to tagged format
	return `emoji:${icon}` as Icon;
}

/**
 * Factory function to create a TableDefinition.
 *
 * `name` and `fields` are required. `description` and `icon` are optional:
 * - `name`: Required display name for the table.
 * - `fields`: Required field schema map.
 * - `description`: Optional. Defaults to empty string.
 * - `icon`: Optional. Accepts Icon string ('emoji:📝'), plain emoji ('📝'), or null. Defaults to null.
 *
 * @example
 * ```typescript
 * // Minimal - name and fields required
 * const posts = table({
 *   name: 'Posts',
 *   fields: { id: id(), title: text(), published: boolean() },
 * });
 *
 * // With icon (tagged format)
 * const posts = table({
 *   name: 'Posts',
 *   icon: 'emoji:📝',
 *   fields: { id: id(), title: text() },
 * });
 *
 * // With icon shorthand (plain emoji)
 * const posts = table({
 *   name: 'Posts',
 *   icon: '📝',  // Converted to 'emoji:📝'
 *   fields: { id: id(), title: text() },
 * });
 *
 * // Full - all metadata explicit
 * const posts = table({
 *   name: 'Blog Posts',
 *   description: 'Articles and blog posts',
 *   icon: 'emoji:📝',
 *   fields: { id: id(), title: text(), published: boolean() },
 * });
 *
 * // In defineWorkspace
 * defineWorkspace({
 *   tables: {
 *     posts: table({ name: 'Posts', fields: { id: id(), title: text() } }),
 *   },
 *   kv: {},
 * });
 * ```
 */
export function table<TFields extends FieldMap>(options: {
	name: string;
	fields: TFields;
	description?: string;
	icon?: string | Icon | null;
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
 * import { setting, select, integer } from '@epicenter/hq';
 *
 * // Production use - with meaningful metadata
 * const theme = setting({
 *   name: 'Theme',
 *   icon: 'emoji:🎨',
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
export function setting<TField extends KvField>(options: {
	name: string;
	field: TField;
	icon?: string | Icon | null;
	description?: string;
}): KvDefinition<TField> {
	return {
		name: options.name,
		icon: normalizeIcon(options.icon),
		description: options.description ?? '',
		field: options.field,
	};
}

export function id({
	name = '',
	description = '',
	icon = null,
}: FieldOptions = {}): IdField {
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
): TextField<true>;
export function text(
	opts?: FieldOptions & {
		nullable?: false;
		default?: string;
	},
): TextField<false>;
export function text({
	nullable = false,
	default: defaultValue,
	name = '',
	description = '',
	icon = null,
}: FieldOptions & {
	nullable?: boolean;
	default?: string;
} = {}): TextField<boolean> {
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
}: FieldOptions = {}): RichtextField {
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
): IntegerField<true>;
export function integer(
	opts?: FieldOptions & {
		nullable?: false;
		default?: number;
	},
): IntegerField<false>;
export function integer({
	nullable = false,
	default: defaultValue,
	name = '',
	description = '',
	icon = null,
}: FieldOptions & {
	nullable?: boolean;
	default?: number;
} = {}): IntegerField<boolean> {
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
): RealField<true>;
export function real(
	opts?: FieldOptions & {
		nullable?: false;
		default?: number;
	},
): RealField<false>;
export function real({
	nullable = false,
	default: defaultValue,
	name = '',
	description = '',
	icon = null,
}: FieldOptions & {
	nullable?: boolean;
	default?: number;
} = {}): RealField<boolean> {
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
): BooleanField<true>;
export function boolean(
	opts?: FieldOptions & {
		nullable?: false;
		default?: boolean;
	},
): BooleanField<false>;
export function boolean({
	nullable = false,
	default: defaultValue,
	name = '',
	description = '',
	icon = null,
}: FieldOptions & {
	nullable?: boolean;
	default?: boolean;
} = {}): BooleanField<boolean> {
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
): DateField<true>;
export function date(
	opts?: FieldOptions & {
		nullable?: false;
		default?: Temporal.ZonedDateTime;
	},
): DateField<false>;
export function date({
	nullable = false,
	default: defaultValue,
	name = '',
	description = '',
	icon = null,
}: FieldOptions & {
	nullable?: boolean;
	default?: Temporal.ZonedDateTime;
} = {}): DateField<boolean> {
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
): SelectField<TOptions, true>;
export function select<const TOptions extends readonly [string, ...string[]]>(
	opts: FieldOptions & {
		options: TOptions;
		nullable?: false;
		default?: TOptions[number];
	},
): SelectField<TOptions, false>;
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
}): SelectField<TOptions, boolean> {
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
): TagsField<TOptions, true>;
export function tags<const TOptions extends readonly [string, ...string[]]>(
	opts: FieldOptions & {
		options: TOptions;
		nullable?: false;
		default?: TOptions[number][];
	},
): TagsField<TOptions, false>;
export function tags<TNullable extends boolean = false>(
	opts?: FieldOptions & {
		nullable?: TNullable;
		default?: string[];
	},
): TagsField<readonly [string, ...string[]], TNullable>;
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
} = {}): TagsField<TOptions, boolean> {
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
): JsonField<T, true>;
export function json<const T extends TSchema>(
	opts: FieldOptions & {
		schema: T;
		nullable?: false;
		default?: Static<T>;
	},
): JsonField<T, false>;
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
}): JsonField<T, boolean> {
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
