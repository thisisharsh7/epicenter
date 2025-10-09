import {
	sqliteTable,
	text,
	integer,
	real,
	blob,
	type SQLiteTable,
	type SQLiteColumnBuilderBase,
} from 'drizzle-orm/sqlite-core';
import type { ColumnSchema, TableSchema } from '../core/column-schemas';

/**
 * Convert a ColumnSchema to a Drizzle column builder
 */
function convertColumnSchemaToDrizzle(
	columnName: string,
	schema: ColumnSchema,
): SQLiteColumnBuilderBase {
	let column: SQLiteColumnBuilderBase;

	switch (schema.type) {
		case 'id':
			column = text(columnName).primaryKey().notNull();
			break;

		case 'text':
		case 'rich-text': // Rich text stored as TEXT in SQLite
			column = text(columnName);
			if (!schema.nullable) column = column.notNull();
			if (schema.type === 'text' && schema.unique) column = column.unique();
			if (schema.type === 'text' && schema.default !== undefined) {
				column =
					typeof schema.default === 'function'
						? column.$defaultFn(schema.default)
						: column.default(schema.default);
			}
			break;

		case 'integer':
			column = integer(columnName);
			if (!schema.nullable) column = column.notNull();
			if (schema.unique) column = column.unique();
			if (schema.default !== undefined) {
				column =
					typeof schema.default === 'function'
						? column.$defaultFn(schema.default)
						: column.default(schema.default);
			}
			break;

		case 'real':
			column = real(columnName);
			if (!schema.nullable) column = column.notNull();
			if (schema.unique) column = column.unique();
			if (schema.default !== undefined) {
				column =
					typeof schema.default === 'function'
						? column.$defaultFn(schema.default)
						: column.default(schema.default);
			}
			break;

		case 'boolean':
			// Boolean stored as INTEGER (0 or 1) in SQLite
			column = integer(columnName, { mode: 'boolean' });
			if (!schema.nullable) column = column.notNull();
			if (schema.default !== undefined) {
				column =
					typeof schema.default === 'function'
						? column.$defaultFn(schema.default)
						: column.default(schema.default);
			}
			break;

		case 'date':
			// Date stored as TEXT in format "ISO_UTC|TIMEZONE"
			column = text(columnName);
			if (!schema.nullable) column = column.notNull();
			if (schema.unique) column = column.unique();
			break;

		case 'select':
			// Select stored as TEXT (single value)
			column = text(columnName);
			if (!schema.nullable) column = column.notNull();
			if (schema.default !== undefined) {
				column = column.default(schema.default);
			}
			break;

		case 'multi-select':
			// Multi-select stored as TEXT with JSON mode (array of strings)
			column = text(columnName, { mode: 'json' });
			if (!schema.nullable) column = column.notNull();
			if (schema.default !== undefined) {
				column = column.default(schema.default);
			}
			break;

		case 'json':
			// JSON stored as TEXT with JSON mode
			column = text(columnName, { mode: 'json' });
			if (!schema.nullable) column = column.notNull();
			if (schema.default !== undefined) {
				column = column.default(schema.default);
			}
			break;

		case 'blob':
			// Blob stored as BLOB
			column = blob(columnName, { mode: 'buffer' });
			if (!schema.nullable) column = column.notNull();
			break;

		default:
			// @ts-expect-error - exhaustive check
			throw new Error(`Unknown column type: ${schema.type}`);
	}

	return column;
}

/**
 * Convert a table schema (all columns) to a Drizzle SQLiteTable
 */
export function convertTableSchemaToDrizzle(
	tableName: string,
	tableSchema: TableSchema,
): SQLiteTable {
	const columns: Record<string, SQLiteColumnBuilderBase> = {};

	for (const [columnName, columnSchema] of Object.entries(tableSchema)) {
		columns[columnName] = convertColumnSchemaToDrizzle(columnName, columnSchema);
	}

	return sqliteTable(tableName, columns);
}

/**
 * Convert all table schemas to Drizzle tables
 * Returns a map of table name → SQLiteTable
 */
export function convertAllTableSchemasToDrizzle(
	schema: Record<string, TableSchema>,
): Record<string, SQLiteTable> {
	const drizzleTables: Record<string, SQLiteTable> = {};

	for (const [tableName, tableSchema] of Object.entries(schema)) {
		drizzleTables[tableName] = convertTableSchemaToDrizzle(
			tableName,
			tableSchema,
		);
	}

	return drizzleTables;
}
