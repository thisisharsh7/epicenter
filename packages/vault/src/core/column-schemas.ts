import { customAlphabet } from 'nanoid';
import type { Brand } from 'wellcrafted/brand';

/**
 * Column schema definitions as pure JSON objects.
 * These schemas are serializable and can be used to generate
 * different storage backends (SQLite, markdown, etc.)
 */

/**
 * ID type - branded string from nanoid
 */
export type Id = string & Brand<'Id'>;

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
 * A datetime value that knows its timezone
 * @property date - JavaScript Date object (internally stored as UTC)
 * @property timezone - IANA timezone identifier
 */
export type DateWithTimezone = { date: Date; timezone: string };

/**
 * Generates a nano ID - 21 character alphanumeric string
 */
export function generateId(): Id {
	const nanoid = customAlphabet(
		'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
		21,
	);
	return nanoid() as Id;
}

/**
 * Base column schema - all columns must have type and nullable
 */
type BaseColumnSchema = {
	type: string;
	nullable: boolean;
};

/**
 * Discriminated union of all column types
 */
export type ColumnSchema =
	| { type: 'id'; nullable: false }
	| {
			type: 'text';
			nullable: boolean;
			unique?: boolean;
			default?: string | (() => string);
	  }
	| { type: 'rich-text'; nullable: boolean; default?: string }
	| {
			type: 'integer';
			nullable: boolean;
			unique?: boolean;
			default?: number | (() => number);
	  }
	| {
			type: 'real';
			nullable: boolean;
			unique?: boolean;
			default?: number | (() => number);
	  }
	| {
			type: 'boolean';
			nullable: boolean;
			default?: boolean | (() => boolean);
	  }
	| {
			type: 'date';
			nullable: boolean;
			unique?: boolean;
			default?: DateWithTimezone | (() => DateWithTimezone);
	  }
	| {
			type: 'select';
			nullable: boolean;
			options: readonly string[];
			default?: string;
	  }
	| {
			type: 'multi-select';
			nullable: boolean;
			options: readonly string[];
			default?: string[];
	  }
	| { type: 'json'; nullable: boolean; default?: any }
	| { type: 'blob'; nullable: boolean };

/**
 * Extract just the type names from ColumnSchema
 */
export type ColumnType = ColumnSchema['type'];

/**
 * Helper type to check if a column type requires options
 */
export type RequiresOptions<T extends ColumnType> = T extends
	| 'select'
	| 'multi-select'
	? true
	: false;

/**
 * Table schema - maps column names to their schemas
 */
export type TableSchema = Record<string, ColumnSchema>;

/**
 * Creates an ID column schema - always primary key with auto-generation
 * @example
 * id() // → { type: 'id', nullable: false }
 */
export function id(): ColumnSchema {
	return { type: 'id', nullable: false };
}

/**
 * Creates a text column schema (NOT NULL by default)
 * @example
 * text() // → { type: 'text', nullable: false }
 * text({ nullable: true }) // → { type: 'text', nullable: true }
 * text({ unique: true, default: 'unnamed' })
 */
export function text(opts?: {
	nullable?: boolean;
	unique?: boolean;
	default?: string | (() => string);
}): ColumnSchema {
	return {
		type: 'text',
		nullable: opts?.nullable ?? false,
		unique: opts?.unique,
		default: opts?.default,
	};
}

/**
 * Creates a rich text column schema (stored as Y.Text in YJS, string in indexes)
 * @example
 * richText() // → { type: 'rich-text', nullable: false }
 * richText({ nullable: true })
 */
export function richText(opts?: {
	nullable?: boolean;
	default?: string;
}): ColumnSchema {
	return {
		type: 'rich-text',
		nullable: opts?.nullable ?? false,
		default: opts?.default,
	};
}

/**
 * Creates an integer column schema (NOT NULL by default)
 * @example
 * integer() // → { type: 'integer', nullable: false }
 * integer({ default: 0 })
 */
export function integer(opts?: {
	nullable?: boolean;
	unique?: boolean;
	default?: number | (() => number);
}): ColumnSchema {
	return {
		type: 'integer',
		nullable: opts?.nullable ?? false,
		unique: opts?.unique,
		default: opts?.default,
	};
}

/**
 * Creates a real/float column schema (NOT NULL by default)
 * @example
 * real() // → { type: 'real', nullable: false }
 * real({ default: 0.0 })
 */
export function real(opts?: {
	nullable?: boolean;
	unique?: boolean;
	default?: number | (() => number);
}): ColumnSchema {
	return {
		type: 'real',
		nullable: opts?.nullable ?? false,
		unique: opts?.unique,
		default: opts?.default,
	};
}

/**
 * Creates a boolean column schema (NOT NULL by default)
 * @example
 * boolean() // → { type: 'boolean', nullable: false }
 * boolean({ default: false })
 */
export function boolean(opts?: {
	nullable?: boolean;
	default?: boolean | (() => boolean);
}): ColumnSchema {
	return {
		type: 'boolean',
		nullable: opts?.nullable ?? false,
		default: opts?.default,
	};
}

/**
 * Creates a date with timezone column schema (NOT NULL by default)
 * @example
 * date() // → { type: 'date', nullable: false }
 * date({ nullable: true })
 * date({ default: () => ({ date: new Date(), timezone: 'UTC' }) })
 */
export function date(opts?: {
	nullable?: boolean;
	unique?: boolean;
	default?: DateWithTimezone | (() => DateWithTimezone);
}): ColumnSchema {
	return {
		type: 'date',
		nullable: opts?.nullable ?? false,
		unique: opts?.unique,
		default: opts?.default,
	};
}

/**
 * Creates a select (single choice) column schema
 * @example
 * select({ options: ['draft', 'published', 'archived'] as const })
 * select({ options: ['tech', 'personal'], default: 'tech' })
 */
export function select(opts: {
	options: readonly string[];
	nullable?: boolean;
	default?: string;
}): ColumnSchema {
	return {
		type: 'select',
		nullable: opts.nullable ?? false,
		options: opts.options,
		default: opts.default,
	};
}

/**
 * Creates a multi-select (multiple choice) column schema
 * @example
 * multiSelect({ options: ['typescript', 'javascript', 'python'] as const })
 * multiSelect({ options: ['tag1', 'tag2'], default: [] })
 */
export function multiSelect(opts: {
	options: readonly string[];
	nullable?: boolean;
	default?: string[];
}): ColumnSchema {
	return {
		type: 'multi-select',
		nullable: opts.nullable ?? false,
		options: opts.options,
		default: opts.default,
	};
}

/**
 * Creates a JSON column schema (NOT NULL by default)
 * @example
 * json() // → { type: 'json', nullable: false }
 * json({ default: {} })
 */
export function json<T = any>(opts?: {
	nullable?: boolean;
	default?: T;
}): ColumnSchema {
	return {
		type: 'json',
		nullable: opts?.nullable ?? false,
		default: opts?.default,
	};
}

/**
 * Creates a blob column schema (NOT NULL by default)
 * @example
 * blob() // → { type: 'blob', nullable: false }
 * blob({ nullable: true })
 */
export function blob(opts?: { nullable?: boolean }): ColumnSchema {
	return {
		type: 'blob',
		nullable: opts?.nullable ?? false,
	};
}
