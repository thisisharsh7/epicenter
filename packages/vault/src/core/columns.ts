import {
	text as drizzleText,
	integer as drizzleInteger,
	real as drizzleReal,
	blob as drizzleBlob,
	numeric as drizzleNumeric
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Column helpers that return functions to create Drizzle columns
 * All columns are NOT NULL by default unless nullable: true is specified
 */
export const columns = {
	/**
	 * Creates a text column (NOT NULL by default)
	 * @example
	 * columns.text() // NOT NULL text
	 * columns.text({ nullable: true }) // Nullable text
	 * columns.text({ primaryKey: true }) // Primary key text
	 * columns.text({ unique: true, default: 'unnamed' }) // Unique with default
	 */
	text({ 
		primaryKey = false,
		nullable = false,
		unique = false,
		default: defaultValue
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
				column = typeof defaultValue === 'function' 
					? column.$defaultFn(defaultValue)
					: column.default(defaultValue);
			}
			
			return column;
		};
	},

	/**
	 * Creates an integer column (NOT NULL by default)
	 * @example
	 * columns.integer() // NOT NULL integer
	 * columns.integer({ nullable: true }) // Nullable integer
	 * columns.integer({ primaryKey: true, autoincrement: true }) // Auto-incrementing PK
	 * columns.integer({ default: 0 }) // NOT NULL with default
	 */
	integer({ 
		primaryKey = false,
		nullable = false,
		unique = false,
		default: defaultValue,
		autoincrement = false
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
			
			if (primaryKey) column = column.primaryKey({ autoIncrement: autoincrement });
			if (unique) column = column.unique();
			if (defaultValue !== undefined) {
				column = typeof defaultValue === 'function'
					? column.$defaultFn(defaultValue)
					: column.default(defaultValue);
			}
			
			return column;
		};
	},

	/**
	 * Creates a real/float column (NOT NULL by default)
	 * @example
	 * columns.real() // NOT NULL real
	 * columns.real({ nullable: true }) // Nullable real
	 * columns.real({ default: 0.0 }) // NOT NULL with default
	 */
	real({ 
		nullable = false,
		unique = false,
		default: defaultValue
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
				column = typeof defaultValue === 'function'
					? column.$defaultFn(defaultValue)
					: column.default(defaultValue);
			}
			
			return column;
		};
	},

	/**
	 * Creates a numeric column for decimals (NOT NULL by default)
	 * @example
	 * columns.numeric() // NOT NULL numeric
	 * columns.numeric({ nullable: true }) // Nullable numeric
	 * columns.numeric({ default: 100.50 }) // NOT NULL with default
	 */
	numeric({ 
		nullable = false,
		unique = false,
		default: defaultValue
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
				column = typeof defaultValue === 'function'
					? column.$defaultFn(defaultValue)
					: column.default(defaultValue);
			}
			
			return column;
		};
	},

	/**
	 * Creates a boolean column (stored as integer 0/1, NOT NULL by default)
	 * @example
	 * columns.boolean() // NOT NULL boolean
	 * columns.boolean({ nullable: true }) // Nullable boolean
	 * columns.boolean({ default: false }) // NOT NULL with default false
	 */
	boolean({ 
		nullable = false,
		default: defaultValue
	}: {
		nullable?: boolean;
		default?: boolean | (() => boolean);
	} = {}) {
		return (name: string) => {
			let column = drizzleInteger(name, { mode: 'boolean' });
			
			// NOT NULL by default
			if (!nullable) column = column.notNull();
			
			if (defaultValue !== undefined) {
				column = typeof defaultValue === 'function'
					? column.$defaultFn(defaultValue)
					: column.default(defaultValue);
			}
			
			return column;
		};
	},

	/**
	 * Creates a timestamp column (stored as integer, NOT NULL by default)
	 * @example
	 * columns.date() // NOT NULL timestamp
	 * columns.date({ nullable: true }) // Nullable timestamp
	 * columns.date({ default: 'NOW' }) // NOT NULL with CURRENT_TIMESTAMP
	 * columns.date({ default: new Date('2024-01-01') }) // NOT NULL with specific date
	 */
	date({ 
		primaryKey = false,
		nullable = false,
		unique = false,
		default: defaultValue
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
				column = typeof defaultValue === 'function'
					? column.$defaultFn(defaultValue)
					: column.default(defaultValue);
			}
			
			return column;
		};
	},

	/**
	 * Creates a JSON column (stored as text, NOT NULL by default)
	 * @example
	 * columns.json() // NOT NULL json
	 * columns.json({ nullable: true }) // Nullable json
	 * columns.json({ default: { tags: [] } }) // NOT NULL with default object
	 * columns.json({ default: () => ({ id: Date.now() }) }) // NOT NULL with dynamic default
	 */
	json<T = any>({ 
		nullable = false,
		default: defaultValue
	}: {
		nullable?: boolean;
		default?: T | (() => T);
	} = {}) {
		return (name: string) => {
			let column = drizzleText(name, { mode: 'json' }).$type<T>();
			
			// NOT NULL by default
			if (!nullable) column = column.notNull();
			
			if (defaultValue !== undefined) {
				column = typeof defaultValue === 'function'
					? column.$defaultFn(() => JSON.stringify(defaultValue()))
					: column.default(JSON.stringify(defaultValue));
			}
			
			return column;
		};
	},

	/**
	 * Creates a blob column (nullable by default for compatibility)
	 * @example
	 * columns.blob() // Nullable blob
	 * columns.blob({ nullable: false }) // NOT NULL blob
	 * columns.blob({ mode: 'json' }) // JSON blob
	 */
	blob({ 
		nullable = true,
		mode = 'buffer' as 'buffer' | 'json'
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
};

// Convenience aliases
export const {
	text,
	integer,
	real,
	numeric,
	boolean,
	date,
	json,
	blob
} = columns;

// Additional aliases for compatibility
export const number = integer;
export const float = real;
export const timestamp = date;

// Re-export Drizzle utilities
export { sql } from 'drizzle-orm';
