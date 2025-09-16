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
 * Date with timezone stored as "ISO_UTC|TIMEZONE" format
 * Example: "2024-01-01T20:00:00.000Z|America/New_York"
 */
export type DateWithTimezone = string & Brand<'DateWithTimezone'>;

/**
 * Creates a DateWithTimezone from a Date object and timezone
 */
export function createDateWithTimezone(
	date: Date,
	timezone: string,
): DateWithTimezone {
	const isoUtc = date.toISOString();
	return `${isoUtc}|${timezone}` as DateWithTimezone;
}

/**
 * Parses a DateWithTimezone back to Date object and timezone
 */
export function parseDateWithTimezone(value: DateWithTimezone): {
	date: Date;
	timezone: string;
} {
	const [isoUtc, timezone] = value.split('|');
	if (!isoUtc || !timezone) {
		throw new Error(`Invalid DateWithTimezone format: ${value}`);
	}
	return {
		date: new Date(isoUtc),
		timezone,
	};
}

/**
 * Type assertion function for DateWithTimezone
 * Pass-through function that asserts a string as DateWithTimezone
 */
export function asDateWithTimezone(value: string): DateWithTimezone {
	return value as DateWithTimezone;
}

/**
 * Creates a date with timezone column (stored as text, NOT NULL by default)
 * Stores dates in format "ISO_UTC|TIMEZONE" (e.g., "2024-01-01T20:00:00.000Z|America/New_York")
 * Note: Only id() columns can be primary keys
 * @example
 * date() // NOT NULL date with timezone
 * date({ nullable: true }) // Nullable date with timezone
 * date({ default: new Date() }) // NOT NULL with specific date
 * date({ default: () => new Date() }) // NOT NULL with dynamic current date
 */
export function date({
	nullable = false,
	unique = false,
	default: defaultValue,
}: {
	nullable?: boolean;
	unique?: boolean;
	default?: Date | (() => Date);
} = {}) {
	/**
	 * Custom Drizzle type for date with timezone storage
	 * Stores as text in format "ISO_UTC|TIMEZONE"
	 */
	const dateWithTimezoneType = customType<{
		data: Date;
		driverData: DateWithTimezone;
	}>({
		dataType() {
			return 'text';
		},
		toDriver(value: Date): DateWithTimezone {
			const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
			return createDateWithTimezone(value, timezone);
		},
		fromDriver(value: DateWithTimezone): Date {
			const parsed = parseDateWithTimezone(value);
			return parsed.date;
		},
	});

	let column = dateWithTimezoneType();

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
