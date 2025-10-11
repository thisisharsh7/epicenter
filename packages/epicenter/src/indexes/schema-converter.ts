import {
	sqliteTable,
	text,
	integer,
	real,
	blob,
	type SQLiteTable,
	type SQLiteColumnBuilderBase,
} from 'drizzle-orm/sqlite-core';
import type { ColumnSchema, Schema, TableSchema } from '../core/column-schemas';

/**
 * Convert all table schemas to Drizzle tables
 * Returns a map of table name → SQLiteTable
 */
export function convertAllTableSchemasToDrizzle<S extends Schema>(
	schema: S,
): Record<keyof S, SQLiteTable> {
	const drizzleTables = {} as Record<keyof S, SQLiteTable>;

	for (const tableName of Object.keys(schema) as Array<keyof S>) {
		drizzleTables[tableName] = convertTableSchemaToDrizzle(
			String(tableName),
			schema[tableName],
		);
	}

	return drizzleTables;
}

/**
 * Convert a table schema (all columns) to a Drizzle SQLiteTable
 */
export function convertTableSchemaToDrizzle<T extends TableSchema>(
	tableName: string,
	tableSchema: T,
): SQLiteTable {
	const columns: Record<string, SQLiteColumnBuilderBase> = {};

	for (const columnName of Object.keys(tableSchema)) {
		columns[columnName] = convertColumnSchemaToDrizzle(
			columnName,
			tableSchema[columnName],
		);
	}

	return sqliteTable(tableName, columns);
}

/**
 * Convert a ColumnSchema to a Drizzle column builder
 */
function convertColumnSchemaToDrizzle<C extends ColumnSchema>(
	columnName: string,
	schema: C,
): SQLiteColumnBuilderBase {
	switch (schema.type) {
		case 'id':
			return text(columnName).primaryKey().notNull();

		case 'text': {
			let column = text(columnName);
			if (!schema.nullable) column = column.notNull();
			if (schema.default !== undefined) {
				column =
					typeof schema.default === 'function'
						? column.$defaultFn(schema.default)
						: column.default(schema.default);
			}
			return column;
		}

		case 'ytext': {
			// Y.Text stored as plain text (lossy conversion via toString())
			let column = text(columnName);
			if (!schema.nullable) column = column.notNull();
			return column;
		}

		case 'yxmlfragment': {
			// Y.XmlFragment stored as plain text (lossy conversion via toString())
			let column = text(columnName);
			if (!schema.nullable) column = column.notNull();
			return column;
		}

		case 'integer': {
			let column = integer(columnName);
			if (!schema.nullable) column = column.notNull();
			if (schema.default !== undefined) {
				column =
					typeof schema.default === 'function'
						? column.$defaultFn(schema.default)
						: column.default(schema.default);
			}
			return column;
		}

		case 'real': {
			let column = real(columnName);
			if (!schema.nullable) column = column.notNull();
			if (schema.default !== undefined) {
				column =
					typeof schema.default === 'function'
						? column.$defaultFn(schema.default)
						: column.default(schema.default);
			}
			return column;
		}

		case 'boolean': {
			// Boolean stored as INTEGER (0 or 1) in SQLite
			let column = integer(columnName, { mode: 'boolean' });
			if (!schema.nullable) column = column.notNull();
			if (schema.default !== undefined) {
				column =
					typeof schema.default === 'function'
						? column.$defaultFn(schema.default)
						: column.default(schema.default);
			}
			return column;
		}

		case 'date': {
			// Date stored as TEXT in format "ISO_UTC|TIMEZONE"
			let column = text(columnName);
			if (!schema.nullable) column = column.notNull();
			return column;
		}

		case 'select': {
			// Select stored as TEXT (single value)
			let column = text(columnName);
			if (!schema.nullable) column = column.notNull();
			if (schema.default !== undefined) {
				column = column.default(schema.default);
			}
			return column;
		}

		case 'multi-select': {
			// Multi-select stored as TEXT with JSON mode (array of strings)
			let column = text(columnName, { mode: 'json' });
			if (!schema.nullable) column = column.notNull();
			if (schema.default !== undefined) {
				column = column.default(schema.default);
			}
			return column;
		}

		default:
			// @ts-expect-error - exhaustive check
			throw new Error(`Unknown column type: ${schema.type}`);
	}
}
