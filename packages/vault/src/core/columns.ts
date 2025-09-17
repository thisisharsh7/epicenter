import {
	text as drizzleText,
	integer as drizzleInteger,
	real as drizzleReal,
	blob as drizzleBlob,
	numeric as drizzleNumeric,
	customType,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { Brand } from 'wellcrafted/brand';
import { customAlphabet } from 'nanoid';

export type Id = string & Brand<'Id'>;

/**
 * Generates a nano ID - 21 character alphanumeric string
 */
function generateNanoId(): Id {
	const nanoid = customAlphabet(
		'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
		21,
	);
	return nanoid() as Id;
}

/**
 * Creates an ID column - always primary key with nano ID generation
 * This is the only column type that can be a primary key.
 * @example
 * id() // Primary key ID column with nano ID generation
 */
export function id() {
	return drizzleText()
		.notNull()
		.primaryKey()
		.$type<Id>()
		.$defaultFn(() => generateNanoId());
}

/**
 * Creates a text column (NOT NULL by default)
 * Note: Only id() columns can be primary keys
 * @example
 * text() // NOT NULL text
 * text({ nullable: true }) // Nullable text
 * text({ unique: true, default: 'unnamed' }) // Unique with default
 */
export function text({
	nullable = false,
	unique = false,
	default: defaultValue,
}: {
	nullable?: boolean;
	unique?: boolean;
	default?: string | (() => string);
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

	return column;
}

/**
 * Creates an integer column (NOT NULL by default)
 * Note: Only id() columns can be primary keys
 * @example
 * integer() // NOT NULL integer
 * integer({ nullable: true }) // Nullable integer
 * integer({ default: 0 }) // NOT NULL with default
 */
export function integer({
	nullable = false,
	unique = false,
	default: defaultValue,
}: {
	nullable?: boolean;
	unique?: boolean;
	default?: number | (() => number);
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

	return column;
}

/**
 * Creates a real/float column (NOT NULL by default)
 * @example
 * real() // NOT NULL real
 * real({ nullable: true }) // Nullable real
 * real({ default: 0.0 }) // NOT NULL with default
 */
export function real({
	nullable = false,
	unique = false,
	default: defaultValue,
}: {
	nullable?: boolean;
	unique?: boolean;
	default?: number | (() => number);
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

	return column;
}

/**
 * Creates a numeric column for decimals (NOT NULL by default)
 * @example
 * numeric() // NOT NULL numeric
 * numeric({ nullable: true }) // Nullable numeric
 * numeric({ default: '100.50' }) // NOT NULL with default
 */
export function numeric({
	nullable = false,
	unique = false,
	default: defaultValue,
}: {
	nullable?: boolean;
	unique?: boolean;
	default?: string | (() => string);
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

	return column;
}

/**
 * Creates a boolean column (stored as integer 0/1, NOT NULL by default)
 * @example
 * boolean() // NOT NULL boolean
 * boolean({ nullable: true }) // Nullable boolean
 * boolean({ default: false }) // NOT NULL with default false
 */
export function boolean({
	nullable = false,
	default: defaultValue,
}: {
	nullable?: boolean;
	default?: boolean | (() => boolean);
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

	return column;
}

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
 * @see https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
 */
export type TimezoneId = string & Brand<'TimezoneId'>;

/**
 * Database storage format combining UTC datetime and timezone
 * @example "2024-01-01T20:00:00.000Z|America/New_York"
 * @internal Storage format - use DateTimeWithTimezone in application code
 */
export type DateTimeWithTimezoneString = `${DateIsoString}|${TimezoneId}` &
	Brand<'DateTimeWithTimezoneString'>;

/**
 * A datetime value that knows its timezone
 * @property date - JavaScript Date object (internally stored as UTC)
 * @property timezone - IANA timezone identifier
 */
export type DateTimeWithTimezone = { date: Date; timezone: string };

/**
 * Normalizes Date or DateTimeWithTimezone to DateTimeWithTimezone
 * If Date is passed, uses system timezone
 */
function normalizeToDateTimeWithTimezone(
	value: Date | DateTimeWithTimezone,
): DateTimeWithTimezone {
	if (value instanceof Date) {
		const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		return { date: value, timezone };
	}
	return value;
}

/**
 * Factory function to create a serializer with inferred types
 */
export function Serializer<TStorage, TInput extends any[], TOutput>(config: {
	serialize(...args: TInput): TStorage;
	deserialize(storage: TStorage): TOutput;
}) {
	return config;
}

/**
 * Serializer for DateTimeWithTimezone - converts between application objects and storage strings
 */
export const DateTimeWithTimezoneSerializer = Serializer({
	serialize(value: Date | DateTimeWithTimezone): DateTimeWithTimezoneString {
		const { date, timezone } = normalizeToDateTimeWithTimezone(value);
		const isoUtc = date.toISOString();
		return asDateTimeWithTimezoneString(`${isoUtc}|${timezone}`);
	},

	deserialize(storage: DateTimeWithTimezoneString): DateTimeWithTimezone {
		const [isoUtc, timezone] = storage.split('|');
		if (!isoUtc || !timezone) {
			throw new Error(`Invalid DateTimeWithTimezone format: ${storage}`);
		}
		return {
			date: new Date(isoUtc),
			timezone,
		};
	},
});

/**
 * Type assertion function for DateTimeWithTimezoneString
 * Pass-through function that asserts a string as DateTimeWithTimezoneString
 */
export function asDateTimeWithTimezoneString(
	value: string,
): DateTimeWithTimezoneString {
	return value as DateTimeWithTimezoneString;
}

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
export function datetime({
	nullable = false,
	unique = false,
	default: defaultValue,
}: {
	nullable?: boolean;
	unique?: boolean;
	default?: Date | DateTimeWithTimezone | (() => Date | DateTimeWithTimezone);
} = {}) {
	/**
	 * Custom Drizzle type for datetime with timezone storage
	 * Stores as text in format "ISO_UTC|TIMEZONE"
	 */
	const dateTimeWithTimezoneType = customType<{
		data: DateTimeWithTimezone;
		driverData: DateTimeWithTimezoneString;
	}>({
		dataType: () => 'text',
		toDriver: (value: DateTimeWithTimezone): DateTimeWithTimezoneString =>
			DateTimeWithTimezoneSerializer.serialize(value),
		fromDriver: (value: DateTimeWithTimezoneString): DateTimeWithTimezone =>
			DateTimeWithTimezoneSerializer.deserialize(value),
	});

	let column = dateTimeWithTimezoneType();

	// NOT NULL by default
	if (!nullable) column = column.notNull();

	if (unique) column = column.unique();

	if (defaultValue !== undefined) {
		column =
			typeof defaultValue === 'function'
				? column.$defaultFn(() =>
						normalizeToDateTimeWithTimezone(defaultValue()),
					)
				: column.default(normalizeToDateTimeWithTimezone(defaultValue));
	}

	return column;
}

/**
 * Alias for datetime() - for backwards compatibility
 * @deprecated Use datetime() instead
 */
export const date = datetime;

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
export function json<T extends JsonValue>({
	nullable = false,
	default: defaultValue,
}: {
	nullable?: boolean;
	default?: T | (() => T);
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

	return column;
}

/**
 * Creates a blob column (nullable by default for compatibility)
 * @example
 * blob() // Nullable blob
 * blob({ nullable: false }) // NOT NULL blob
 * blob({ mode: 'json' }) // JSON blob
 */
export function blob({
	nullable = true,
	mode = 'buffer' as 'buffer' | 'json',
}: {
	nullable?: boolean;
	mode?: 'buffer' | 'json';
} = {}) {
	let column = drizzleBlob({ mode });

	// Blob is nullable by default (different from other types)
	if (!nullable) column = column.notNull();

	return column;
}

// Re-export Drizzle utilities
export { sql } from 'drizzle-orm';
