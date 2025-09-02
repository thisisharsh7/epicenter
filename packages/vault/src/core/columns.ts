import {
	text as drizzleText,
	integer as drizzleInteger,
	real as drizzleReal,
	blob as drizzleBlob,
	numeric as drizzleNumeric
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Creates a text column (NOT NULL by default)
 * @param name Column name
 * @param nullable Set to true to allow NULL values (default: false)
 * @example
 * text('title') // NOT NULL text column
 * text('bio', true) // Nullable text column
 * text('slug').unique() // NOT NULL with unique constraint
 */
export function text(name: string, nullable = false) {
	const builder = drizzleText(name);
	return nullable ? builder : builder.notNull();
}

/**
 * Creates an integer column (NOT NULL by default)
 * @param name Column name
 * @param nullable Set to true to allow NULL values (default: false)
 * @example
 * integer('count') // NOT NULL integer
 * integer('age', true) // Nullable integer
 * integer('views').default(0) // NOT NULL with default
 */
export function integer(name: string, nullable = false) {
	const builder = drizzleInteger(name);
	return nullable ? builder : builder.notNull();
}

/**
 * Creates a real/float column (NOT NULL by default)
 * @param name Column name  
 * @param nullable Set to true to allow NULL values (default: false)
 * @example
 * real('price') // NOT NULL real
 * real('discount', true) // Nullable real
 */
export function real(name: string, nullable = false) {
	const builder = drizzleReal(name);
	return nullable ? builder : builder.notNull();
}

/**
 * Creates a blob column (NOT NULL by default)
 * @param name Column name
 * @param mode 'buffer' or 'json' (default: 'buffer')
 * @param nullable Set to true to allow NULL values (default: false)
 * @example
 * blob('data', 'buffer') // NOT NULL buffer blob
 * blob('metadata', 'json', true) // Nullable JSON blob
 */
export function blob(name: string, mode: 'buffer' | 'json' = 'buffer', nullable = false) {
	const builder = drizzleBlob(name, { mode });
	return nullable ? builder : builder.notNull();
}

/**
 * Creates a numeric column for decimals (NOT NULL by default)
 * @param name Column name
 * @param nullable Set to true to allow NULL values (default: false)
 * @example
 * numeric('amount') // NOT NULL numeric
 * numeric('percentage', true) // Nullable numeric
 */
export function numeric(name: string, nullable = false) {
	const builder = drizzleNumeric(name);
	return nullable ? builder : builder.notNull();
}

// Semantic helpers for common patterns

/**
 * Creates an auto-incrementing primary key integer column
 * @param name Column name (default: 'id')
 * @example
 * id() // Creates 'id' column
 * id('user_id') // Custom name
 */
export function id(name = 'id') {
	return drizzleInteger(name).primaryKey({ autoIncrement: true });
}

/**
 * Creates a timestamp column (stored as integer, NOT NULL by default)
 * @param name Column name
 * @param nullable Set to true to allow NULL values (default: false)
 * @example
 * timestamp('created_at') // NOT NULL timestamp
 * timestamp('deleted_at', true) // Nullable timestamp
 */
export function timestamp(name: string, nullable = false) {
	const builder = drizzleInteger(name, { mode: 'timestamp' });
	return nullable ? builder : builder.notNull();
}

/**
 * Creates a timestamp column with CURRENT_TIMESTAMP default
 * @param name Column name
 * @example
 * timestampNow('created_at') // Automatically set to current time
 */
export function timestampNow(name: string) {
	return drizzleInteger(name, { mode: 'timestamp' })
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`);
}

/**
 * Creates a boolean column (stored as integer 0/1, NOT NULL by default)
 * @param name Column name
 * @param nullable Set to true to allow NULL values (default: false)
 * @example
 * boolean('is_active') // NOT NULL boolean
 * boolean('is_verified', true) // Nullable boolean
 * boolean('is_public').default(false) // With default
 */
export function boolean(name: string, nullable = false) {
	const builder = drizzleInteger(name, { mode: 'boolean' });
	return nullable ? builder : builder.notNull();
}

/**
 * Creates a JSON column (stored as text, NOT NULL by default)
 * @param name Column name
 * @param nullable Set to true to allow NULL values (default: false)
 * @example
 * json<{tags: string[]}>('metadata') // Typed JSON column
 * json('settings', true) // Nullable JSON
 */
export function json<T = unknown>(name: string, nullable = false) {
	const builder = drizzleText(name, { mode: 'json' }).$type<T>();
	return nullable ? builder : builder.notNull();
}

// Aliases for compatibility
export const number = integer;
export const float = real;
export const date = timestamp;

// Re-export Drizzle utilities
export { sql } from 'drizzle-orm';
