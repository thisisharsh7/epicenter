import type {
	ColumnBuilderBase,
	ColumnBuilderBaseConfig,
	ColumnDataType,
	HasDefault,
	HasRuntimeDefault,
	NotNull,
} from 'drizzle-orm';
import {
	customType,
	blob as drizzleBlob,
	integer as drizzleInteger,
	numeric as drizzleNumeric,
	real as drizzleReal,
	text as drizzleText,
} from 'drizzle-orm/sqlite-core';
import { customAlphabet } from 'nanoid';
import type { Brand } from 'wellcrafted/brand';
import type { DateWithTimezone, Id } from '../../core/column-schemas';

/**
 * ISO 8601 UTC datetime string from Date.toISOString()
 * @example "2024-01-01T20:00:00.000Z"
 */
export type DateIsoString = string & Brand<'UtcIsoString'>;

/**
 * IANA timezone identifier
 * @example "America/New_York"
 * @example "Europe/London"
 * @example "Asia/Tokyo"
 * @example "UTC"
 */
export type TimezoneId = string & Brand<'TimezoneId'>;

/**
 * Database storage format combining UTC datetime and timezone
 * @example "2024-01-01T20:00:00.000Z|America/New_York"
 */
export type DateWithTimezoneString = `${DateIsoString}|${TimezoneId}` &
	Brand<'DateWithTimezoneString'>;

/**
 * Type helper that composes Drizzle column modifiers based on options
 * Builds the type step by step for cleaner composition
 */
type ApplyColumnModifiers<
	TBase extends ColumnBuilderBase<
		ColumnBuilderBaseConfig<ColumnDataType, string>,
		object
	>,
	TNullable extends boolean,
	TDefault,
> = TDefault extends (...args: any[]) => any
	? TNullable extends false
		? HasRuntimeDefault<HasDefault<NotNull<TBase>>>
		: HasRuntimeDefault<HasDefault<TBase>>
	: TDefault extends undefined
		? TNullable extends false
			? NotNull<TBase>
			: TBase
		: TNullable extends false
			? HasDefault<NotNull<TBase>>
			: HasDefault<TBase>;

/**
 * Creates an ID column - always primary key with nano ID generation
 * This is the only column type that can be a primary key.
 * @example
 * id() // Primary key ID column with nano ID generation
 */
export function id() {
	/**
	 * Generates a nano ID - 21 character alphanumeric string
	 */
	const generateNanoId = (): Id => {
		const nanoid = customAlphabet(
			'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
			21,
		);
		return nanoid() as Id;
	};

	return (
		drizzleText()
			.notNull()
			.primaryKey()
			// .$type<Id>()
			.$defaultFn(() => generateNanoId())
	);
}

/**
 * Creates a text column (NOT NULL by default)
 * Note: Only id() columns can be primary keys
 * @example
 * text() // NOT NULL text
 * text({ nullable: true }) // Nullable text
 * text({ unique: true, default: 'unnamed' }) // Unique with default
 */
export function text<
	TNullable extends boolean = false,
	TDefault extends string | (() => string) | undefined = undefined,
>({
	nullable = false as TNullable,
	unique = false,
	default: defaultValue,
}: {
	nullable?: TNullable;
	unique?: boolean;
	default?: TDefault;
} = {}) {
	let column = drizzleText();

	// NOT NULL by default
	if (!nullable) column = column.notNull();

	if (unique) column = column.unique();
	if (defaultValue !== undefined) {
		column =
			typeof defaultValue === 'function'
				? column.$defaultFn(defaultValue)
				: column.default(defaultValue);
	}

	return column as ApplyColumnModifiers<typeof column, TNullable, TDefault>;
}

/**
 * Creates an integer column (NOT NULL by default)
 * Note: Only id() columns can be primary keys
 * @example
 * integer() // NOT NULL integer
 * integer({ nullable: true }) // Nullable integer
 * integer({ default: 0 }) // NOT NULL with default
 */
export function integer<
	TNullable extends boolean = false,
	TDefault extends number | (() => number) | undefined = undefined,
>({
	nullable = false as TNullable,
	unique = false,
	default: defaultValue,
}: {
	nullable?: TNullable;
	unique?: boolean;
	default?: TDefault;
} = {}) {
	let column = drizzleInteger();

	// NOT NULL by default
	if (!nullable) column = column.notNull();

	if (unique) column = column.unique();
	if (defaultValue !== undefined) {
		column =
			typeof defaultValue === 'function'
				? column.$defaultFn(defaultValue)
				: column.default(defaultValue);
	}

	return column as ApplyColumnModifiers<typeof column, TNullable, TDefault>;
}

/**
 * Creates a real/float column (NOT NULL by default)
 * @example
 * real() // NOT NULL real
 * real({ nullable: true }) // Nullable real
 * real({ default: 0.0 }) // NOT NULL with default
 */
export function real<
	TNullable extends boolean = false,
	TDefault extends number | (() => number) | undefined = undefined,
>({
	nullable = false as TNullable,
	unique = false,
	default: defaultValue,
}: {
	nullable?: TNullable;
	unique?: boolean;
	default?: TDefault;
} = {}) {
	let column = drizzleReal();

	// NOT NULL by default
	if (!nullable) column = column.notNull();

	if (unique) column = column.unique();
	if (defaultValue !== undefined) {
		column =
			typeof defaultValue === 'function'
				? column.$defaultFn(defaultValue)
				: column.default(defaultValue);
	}

	return column as ApplyColumnModifiers<typeof column, TNullable, TDefault>;
}

/**
 * Creates a numeric column for decimals (NOT NULL by default)
 * @example
 * numeric() // NOT NULL numeric
 * numeric({ nullable: true }) // Nullable numeric
 * numeric({ default: '100.50' }) // NOT NULL with default
 */
export function numeric<
	TNullable extends boolean = false,
	TDefault extends string | (() => string) | undefined = undefined,
>({
	nullable = false as TNullable,
	unique = false,
	default: defaultValue,
}: {
	nullable?: TNullable;
	unique?: boolean;
	default?: TDefault;
} = {}) {
	let column = drizzleNumeric();

	// NOT NULL by default
	if (!nullable) column = column.notNull();

	if (unique) column = column.unique();
	if (defaultValue !== undefined) {
		column =
			typeof defaultValue === 'function'
				? column.$defaultFn(defaultValue)
				: column.default(defaultValue);
	}

	return column as ApplyColumnModifiers<typeof column, TNullable, TDefault>;
}

/**
 * Creates a boolean column (stored as integer 0/1, NOT NULL by default)
 * @example
 * boolean() // NOT NULL boolean
 * boolean({ nullable: true }) // Nullable boolean
 * boolean({ default: false }) // NOT NULL with default false
 */
export function boolean<
	TNullable extends boolean = false,
	TDefault extends boolean | (() => boolean) | undefined = undefined,
>({
	nullable = false as TNullable,
	default: defaultValue,
}: {
	nullable?: TNullable;
	default?: TDefault;
} = {}) {
	let column = drizzleInteger({ mode: 'boolean' });

	// NOT NULL by default
	if (!nullable) column = column.notNull();

	if (defaultValue !== undefined) {
		column =
			typeof defaultValue === 'function'
				? column.$defaultFn(defaultValue)
				: column.default(defaultValue);
	}

	return column as ApplyColumnModifiers<typeof column, TNullable, TDefault>;
}

/**
 * Factory function to create a serializer with inferred types
 */
export function Serializer<TValue, TSerialized>(config: {
	serialize(value: TValue): TSerialized;
	deserialize(storage: TSerialized): TValue;
}) {
	return config;
}

/**
 * Serializer for DateWithTimezone - converts between application objects and storage strings
 */
export const DateWithTimezoneSerializer = Serializer({
	serialize({ date, timezone }: DateWithTimezone): DateWithTimezoneString {
		const isoUtc = date.toISOString();
		return `${isoUtc}|${timezone}` as DateWithTimezoneString;
	},

	deserialize(storage: DateWithTimezoneString): DateWithTimezone {
		const [isoUtc, timezone] = storage.split('|');
		if (!isoUtc || !timezone) {
			throw new Error(`Invalid DateWithTimezone format: ${storage}`);
		}
		return {
			date: new Date(isoUtc),
			timezone,
		};
	},
});

/**
 * Creates a datetime with timezone column (stored as text, NOT NULL by default)
 * Stores dates in format "ISO_UTC|TIMEZONE" (e.g., "2024-01-01T20:00:00.000Z|America/New_York")
 * Note: Only id() columns can be primary keys
 * @example
 * datetime() // NOT NULL datetime with timezone
 * datetime({ nullable: true }) // Nullable datetime with timezone
 * datetime({ default: new Date() }) // NOT NULL with system timezone
 * datetime({ default: () => new Date() }) // NOT NULL with dynamic current date
 */
export function date<
	TNullable extends boolean = false,
	TDefault extends
		| Date
		| DateWithTimezone
		| (() => Date | DateWithTimezone)
		| undefined = undefined,
>({
	nullable = false as TNullable,
	unique = false,
	default: defaultValue,
}: {
	nullable?: TNullable;
	unique?: boolean;
	default?: TDefault;
} = {}) {
	/**
	 * Normalizes Date or DateWithTimezone to DateWithTimezone
	 * If Date is passed, uses system timezone
	 */
	const normalizeToDateWithTimezone = (
		value: Date | DateWithTimezone,
	): DateWithTimezone => {
		if (value instanceof Date) {
			const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
			return { date: value, timezone };
		}
		return value;
	};

	/**
	 * Custom Drizzle type for datetime with timezone storage
	 * Stores as text in format "ISO_UTC|TIMEZONE"
	 */
	const dateWithTimezoneType = customType<{
		data: DateWithTimezone;
		driverData: DateWithTimezoneString;
	}>({
		dataType: () => 'text',
		toDriver: (value: DateWithTimezone): DateWithTimezoneString =>
			DateWithTimezoneSerializer.serialize(value),
		fromDriver: (value: DateWithTimezoneString): DateWithTimezone =>
			DateWithTimezoneSerializer.deserialize(value),
	});

	let column = dateWithTimezoneType();

	// NOT NULL by default
	if (!nullable) column = column.notNull();

	if (unique) column = column.unique();

	if (defaultValue !== undefined) {
		column =
			typeof defaultValue === 'function'
				? column.$defaultFn(() => normalizeToDateWithTimezone(defaultValue()))
				: column.default(normalizeToDateWithTimezone(defaultValue));
	}

	return column as ApplyColumnModifiers<typeof column, TNullable, TDefault>;
}

type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [k: string]: JsonValue };

/**
 * Creates a JSON column (stored as text, NOT NULL by default)
 * @example
 * json() // NOT NULL json
 * json({ nullable: true }) // Nullable json
 * json({ default: { tags: [] } }) // NOT NULL with default object
 * json({ default: () => ({ id: Date.now() }) }) // NOT NULL with dynamic default
 */
export function json<
	T extends JsonValue,
	TNullable extends boolean = false,
	TDefault extends T | (() => T) | undefined = undefined,
>({
	nullable = false as TNullable,
	default: defaultValue,
}: {
	nullable?: TNullable;
	default?: TDefault;
} = {}) {
	let column = drizzleText({ mode: 'json' }).$type<T>();

	// NOT NULL by default
	if (!nullable) column = column.notNull();

	if (defaultValue !== undefined) {
		column =
			typeof defaultValue === 'function'
				? column.$defaultFn(defaultValue)
				: column.default(defaultValue);
	}

	return column as ApplyColumnModifiers<typeof column, TNullable, TDefault>;
}

/**
 * Creates a blob column (nullable by default for compatibility)
 * @example
 * blob() // NOT NULL blob
 * blob({ nullable: true }) // Nullable blob
 */
export function blob<TNullable extends boolean = false>({
	nullable = false as TNullable,
}: {
	nullable?: TNullable;
} = {}) {
	let column = drizzleBlob({ mode: 'buffer' });

	// NOT NULL by default
	if (!nullable) column = column.notNull();

	return column as ApplyColumnModifiers<typeof column, TNullable, undefined>;
}

/**
 * Creates a multi-select column (stored as JSON text, NOT NULL by default)
 * Uses non-empty array constraint [string, ...string[]] to ensure at least one option
 * @example
 * multiSelect({ options: ['admin', 'user', 'guest'] as const })
 * multiSelect({ options: ['red', 'blue'] as const, nullable: true })
 * multiSelect({ options: ['tag1', 'tag2'] as const, default: [] })
 * multiSelect({ options: ['a', 'b'] as const, default: ['a'] })
 */
export function multiSelect<
	const TOptions extends readonly [string, ...string[]],
	TNullable extends boolean = false,
	TDefault extends
		| TOptions[number][]
		| (() => TOptions[number][])
		| undefined = undefined,
>({
	options,
	nullable = false as TNullable,
	default: defaultValue,
}: {
	options: TOptions;
	nullable?: TNullable;
	default?: TDefault;
}) {
	const optionsSet = new Set(options);

	const multiSelectSerializer = Serializer({
		serialize(value: TOptions[number][]): string {
			return JSON.stringify(value);
		},
		deserialize(storage: string): TOptions[number][] {
			try {
				const parsed = JSON.parse(storage);
				if (!Array.isArray(parsed)) {
					return [];
				}
				// Filter out items not in the options set
				return parsed.filter((item) => optionsSet.has(item)) as TOptions[number][];
			} catch (error) {
				return [];
			}
		},
	});

	const multiSelectType = customType<{
		data: TOptions[number][];
		driverData: string;
	}>({
		dataType: () => 'text',
		toDriver: (value: TOptions[number][]): string =>
			multiSelectSerializer.serialize(value),
		fromDriver: (value: string): TOptions[number][] =>
			multiSelectSerializer.deserialize(value),
	});

	let column = multiSelectType();

	// NOT NULL by default
	if (!nullable) column = column.notNull();

	if (defaultValue !== undefined) {
		column =
			typeof defaultValue === 'function'
				? column.$defaultFn(defaultValue)
				: column.default(defaultValue);
	}

	return column as ApplyColumnModifiers<typeof column, TNullable, TDefault>;
}

// Re-export Drizzle utilities
export { sql } from 'drizzle-orm';
