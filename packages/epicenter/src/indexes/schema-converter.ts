import {
	sqliteTable,
	text,
	integer,
	real,
	blob,
	type SQLiteTable,
	type SQLiteColumnBuilderBase,
	type SQLiteTextBuilderInitial,
	type SQLiteIntegerBuilderInitial,
	type SQLiteRealBuilderInitial,
	SQLiteBooleanBuilderInitial,
	SQLiteTextJsonBuilderInitial,
} from 'drizzle-orm/sqlite-core';
import type {
	ColumnSchema,
	Schema,
	TableSchema,
	IdColumnSchema,
	TextColumnSchema,
	YtextColumnSchema,
	YxmlfragmentColumnSchema,
	IntegerColumnSchema,
	RealColumnSchema,
	BooleanColumnSchema,
	DateColumnSchema,
	SelectColumnSchema,
	MultiSelectColumnSchema,
} from '../core/column-schemas';
import { IsPrimaryKey, NotNull } from 'drizzle-orm';

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
 * Maps a ColumnSchema to its corresponding Drizzle column builder type
 */
type ColumnToDrizzle<C extends ColumnSchema> = C extends IdColumnSchema
	? IsPrimaryKey<NotNull<SQLiteTextBuilderInitial<"", [string, ...string[]], undefined>>>
	: C extends TextColumnSchema
		? C extends { nullable: true }
			? SQLiteTextBuilderInitial<'', [string, ...string[]], undefined>
			: NotNull<SQLiteTextBuilderInitial<'', [string, ...string[]], undefined>>
		: C extends YtextColumnSchema
			? C extends { nullable: true }
				? SQLiteTextBuilderInitial<'', [string, ...string[]], undefined>
				: NotNull<SQLiteTextBuilderInitial<'', [string, ...string[]], undefined>>
			: C extends YxmlfragmentColumnSchema
				? C extends { nullable: true }
					? SQLiteTextBuilderInitial<'', [string, ...string[]], undefined>
					: NotNull<SQLiteTextBuilderInitial<'', [string, ...string[]], undefined>>
				: C extends IntegerColumnSchema
					? C extends { nullable: true }
						? SQLiteIntegerBuilderInitial<"">
						: NotNull<SQLiteIntegerBuilderInitial<"">>
					: C extends RealColumnSchema
						? C extends { nullable: true }
							? SQLiteRealBuilderInitial<"">
							: NotNull<SQLiteRealBuilderInitial<"">>
						: C extends BooleanColumnSchema
							? C extends { nullable: true }
								? SQLiteBooleanBuilderInitial<"">
								: NotNull<SQLiteBooleanBuilderInitial<"">>
							: C extends DateColumnSchema
								? C extends { nullable: true }
									? SQLiteTextBuilderInitial<'', [string, ...string[]], undefined>
									: NotNull<SQLiteTextBuilderInitial<'', [string, ...string[]], undefined>>
								: C extends SelectColumnSchema<infer TOptions extends readonly [string, ...string[]]>
									? C extends { nullable: true }
										? SQLiteTextBuilderInitial<'', [...TOptions], number | undefined>
										: NotNull<SQLiteTextBuilderInitial<'', [...TOptions], number | undefined>>
									: C extends MultiSelectColumnSchema
										? C extends { nullable: true }
											? SQLiteTextJsonBuilderInitial<''>
											: NotNull<SQLiteTextJsonBuilderInitial<''>>
										: never;

/**
 * Convert a ColumnSchema to a Drizzle column builder
 */
function convertColumnSchemaToDrizzle<C extends ColumnSchema>(
	columnName: string,
	schema: C,
): ColumnToDrizzle<C> {
	switch (schema.type) {
		case 'id':
			return text(columnName).primaryKey().notNull() as ColumnToDrizzle<C>;

		case 'text': {
			let column = text(columnName);
			if (!schema.nullable) column = column.notNull();
			if (schema.default !== undefined) {
				column =
					typeof schema.default === 'function'
						? column.$defaultFn(schema.default)
						: column.default(schema.default);
			}
			return column as ColumnToDrizzle<C>;
		}

		case 'ytext': {
			// Y.Text stored as plain text (lossy conversion via toString())
			let column = text(columnName);
			if (!schema.nullable) column = column.notNull();
			return column as ColumnToDrizzle<C>;
		}

		case 'yxmlfragment': {
			// Y.XmlFragment stored as plain text (lossy conversion via toString())
			let column = text(columnName);
			if (!schema.nullable) column = column.notNull();
			return column as ColumnToDrizzle<C>;
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
			return column as ColumnToDrizzle<C>;
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
			return column as ColumnToDrizzle<C>;
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
			return column as ColumnToDrizzle<C>;
		}

		case 'date': {
			// Date stored as TEXT in format "ISO_UTC|TIMEZONE"
			let column = text(columnName);
			if (!schema.nullable) column = column.notNull();
			return column as ColumnToDrizzle<C>;
		}

		case 'select': {
			// Select stored as TEXT (single value)
			let column = text(columnName);
			if (!schema.nullable) column = column.notNull();
			if (schema.default !== undefined) {
				column = column.default(schema.default);
			}
			return column as ColumnToDrizzle<C>;
		}

		case 'multi-select': {
			// Multi-select stored as TEXT with JSON mode (array of strings)
			let column = text(columnName, { mode: 'json' });
			if (!schema.nullable) column = column.notNull();
			if (schema.default !== undefined) {
				column = column.default(schema.default);
			}
			return column as ColumnToDrizzle<C>;
		}

		default:
			// @ts-expect-error - exhaustive check
			throw new Error(`Unknown column type: ${schema.type}`);
	}
}
