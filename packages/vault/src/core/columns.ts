import {
	text as drizzleText,
	integer as drizzleInteger,
	real as drizzleReal,
	blob as drizzleBlob,
	numeric as drizzleNumeric,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Creates a text column (NOT NULL by default)
 * @example
 * text() // NOT NULL text
 * text({ nullable: true }) // Nullable text
 * text({ primaryKey: true }) // Primary key text
 * text({ unique: true, default: 'unnamed' }) // Unique with default
 */
export function text({
	primaryKey = false,
	nullable = false,
	unique = false,
	default: defaultValue,
}: {
	primaryKey?: boolean;
	nullable?: boolean;
	unique?: boolean;
	default?: string | (() => string);
} = {}) {
	return (name: string) => {
		let column = drizzleText(name);

		// NOT NULL by default
		if (!nullable) column = column.notNull();

		if (primaryKey) column = column.primaryKey();
		if (unique) column = column.unique();
		if (defaultValue !== undefined) {
			column =
				typeof defaultValue === 'function'
					? column.$defaultFn(defaultValue)
					: column.default(defaultValue);
		}

		return column;
	};
}

/**
 * Creates an integer column (NOT NULL by default)
 * @example
 * integer() // NOT NULL integer
 * integer({ nullable: true }) // Nullable integer
 * integer({ primaryKey: true, autoincrement: true }) // Auto-incrementing PK
 * integer({ default: 0 }) // NOT NULL with default
 */
export function integer({
	primaryKey = false,
	nullable = false,
	unique = false,
	default: defaultValue,
	autoincrement = false,
}: {
	primaryKey?: boolean;
	nullable?: boolean;
	unique?: boolean;
	default?: number | (() => number);
	autoincrement?: boolean;
} = {}) {
	return (name: string) => {
		let column = drizzleInteger(name);

		// NOT NULL by default
		if (!nullable) column = column.notNull();

		if (primaryKey)
			column = column.primaryKey({ autoIncrement: autoincrement });
		if (unique) column = column.unique();
		if (defaultValue !== undefined) {
			column =
				typeof defaultValue === 'function'
					? column.$defaultFn(defaultValue)
					: column.default(defaultValue);
		}

		return column;
	};
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
	return (name: string) => {
		let column = drizzleReal(name);

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
	};
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
	return (name: string) => {
		let column = drizzleNumeric(name);

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
	};
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
	return (name: string) => {
		let column = drizzleInteger(name, { mode: 'boolean' });

		// NOT NULL by default
		if (!nullable) column = column.notNull();

		if (defaultValue !== undefined) {
			column =
				typeof defaultValue === 'function'
					? column.$defaultFn(defaultValue)
					: column.default(defaultValue);
		}

		return column;
	};
}

/**
 * Creates a timestamp column (stored as integer, NOT NULL by default)
 * @example
 * date() // NOT NULL timestamp
 * date({ nullable: true }) // Nullable timestamp
 * date({ default: 'NOW' }) // NOT NULL with CURRENT_TIMESTAMP
 * date({ default: new Date('2024-01-01') }) // NOT NULL with specific date
 */
export function date({
	primaryKey = false,
	nullable = false,
	unique = false,
	default: defaultValue,
}: {
	primaryKey?: boolean;
	nullable?: boolean;
	unique?: boolean;
	default?: Date | 'NOW' | (() => Date);
} = {}) {
	return (name: string) => {
		let column = drizzleInteger(name, { mode: 'timestamp' });

		// NOT NULL by default
		if (!nullable) column = column.notNull();

		if (primaryKey) column = column.primaryKey();
		if (unique) column = column.unique();

		if (defaultValue === 'NOW') {
			column = column.default(sql`CURRENT_TIMESTAMP`);
		} else if (defaultValue !== undefined) {
			column =
				typeof defaultValue === 'function'
					? column.$defaultFn(defaultValue)
					: column.default(defaultValue);
		}

		return column;
	};
}

/**
 * Creates a JSON column (stored as text, NOT NULL by default)
 * @example
 * json() // NOT NULL json
 * json({ nullable: true }) // Nullable json
 * json({ default: { tags: [] } }) // NOT NULL with default object
 * json({ default: () => ({ id: Date.now() }) }) // NOT NULL with dynamic default
 */
export function json<T = any>({
	nullable = false,
	default: defaultValue,
}: {
	nullable?: boolean;
	default?: T | (() => T);
} = {}) {
	return (name: string) => {
		let column = drizzleText(name, { mode: 'json' }).$type<T>();

		// NOT NULL by default
		if (!nullable) column = column.notNull();

		if (defaultValue !== undefined) {
			column =
				typeof defaultValue === 'function'
					? column.$defaultFn(() => JSON.stringify(defaultValue()))
					: column.default(JSON.stringify(defaultValue));
		}

		return column;
	};
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
	return (name: string) => {
		let column = drizzleBlob(name, { mode });

		// Blob is nullable by default (different from other types)
		if (!nullable) column = column.notNull();

		return column;
	};
}

// Re-export Drizzle utilities
export { sql } from 'drizzle-orm';
