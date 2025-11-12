import type { IsPrimaryKey, NotNull } from 'drizzle-orm';
import {
	type SQLiteBooleanBuilderInitial,
	type SQLiteCustomColumnBuilder,
	type SQLiteIntegerBuilderInitial,
	type SQLiteRealBuilderInitial,
	type SQLiteTable,
	type SQLiteTextBuilderInitial,
	integer,
	real,
	sqliteTable,
	text,
} from 'drizzle-orm/sqlite-core';
import type {
	BooleanColumnSchema,
	ColumnSchema,
	DateColumnSchema,
	DateWithTimezone,
	DateWithTimezoneString,
	IdColumnSchema,
	IntegerColumnSchema,
	TagsColumnSchema,
	RealColumnSchema,
	SelectColumnSchema,
	TableSchema,
	TextColumnSchema,
	WorkspaceSchema,
	YtextColumnSchema,
} from '../../../core/schema';
import { date, tags } from './builders';

/**
 * Maps a WorkspaceSchema to its Drizzle table representations
 */
export type WorkspaceSchemaToDrizzleTables<
	TWorkspaceSchema extends WorkspaceSchema,
> = {
	[K in keyof TWorkspaceSchema & string]: ReturnType<
		typeof convertTableSchemaToDrizzle<K, TWorkspaceSchema[K]>
	>;
};

/**
 * Convert workspace schema to Drizzle tables
 * Returns a map of table name → SQLiteTable with preserved types
 */
export function convertWorkspaceSchemaToDrizzle<
	TWorkspaceSchema extends WorkspaceSchema,
>(schema: TWorkspaceSchema): WorkspaceSchemaToDrizzleTables<TWorkspaceSchema> {
	const result: Record<string, SQLiteTable> = {};

	for (const tableName of Object.keys(schema) as Array<
		keyof TWorkspaceSchema & string
	>) {
		const tableSchema = schema[tableName];
		if (!tableSchema) {
			throw new Error(`Table schema for "${String(tableName)}" is undefined`);
		}
		result[tableName] = convertTableSchemaToDrizzle(tableName, tableSchema);
	}

	return result as WorkspaceSchemaToDrizzleTables<TWorkspaceSchema>;
}

/**
 * Convert a table schema (all columns) to a Drizzle SQLiteTable with precise types
 */
export function convertTableSchemaToDrizzle<
	TTableName extends string,
	TTableSchema extends TableSchema,
>(tableName: TTableName, tableSchema: TTableSchema) {
	const columns = Object.fromEntries(
		Object.keys(tableSchema).map((columnName) => [
			columnName,
			convertColumnSchemaToDrizzle(
				columnName,
				tableSchema[columnName as keyof TTableSchema],
			),
		]),
	) as { [Key in keyof TTableSchema]: ColumnToDrizzle<TTableSchema[Key]> };

	return sqliteTable(tableName, columns);
}

/**
 * Maps a ColumnSchema to its corresponding Drizzle column builder type
 */
type ColumnToDrizzle<C extends ColumnSchema> = C extends IdColumnSchema
	? IsPrimaryKey<
			NotNull<SQLiteTextBuilderInitial<'', [string, ...string[]], undefined>>
		>
	: C extends TextColumnSchema<infer TNullable>
		? TNullable extends true
			? SQLiteTextBuilderInitial<'', [string, ...string[]], undefined>
			: NotNull<SQLiteTextBuilderInitial<'', [string, ...string[]], undefined>>
		: C extends YtextColumnSchema<infer TNullable>
			? TNullable extends true
				? SQLiteTextBuilderInitial<'', [string, ...string[]], undefined>
				: NotNull<
						SQLiteTextBuilderInitial<'', [string, ...string[]], undefined>
					>
			: C extends IntegerColumnSchema<infer TNullable>
				? TNullable extends true
					? SQLiteIntegerBuilderInitial<''>
					: NotNull<SQLiteIntegerBuilderInitial<''>>
				: C extends RealColumnSchema<infer TNullable>
					? TNullable extends true
						? SQLiteRealBuilderInitial<''>
						: NotNull<SQLiteRealBuilderInitial<''>>
					: C extends BooleanColumnSchema<infer TNullable>
						? TNullable extends true
							? SQLiteBooleanBuilderInitial<''>
							: NotNull<SQLiteBooleanBuilderInitial<''>>
						: C extends DateColumnSchema<infer TNullable>
							? TNullable extends true
								? SQLiteCustomColumnBuilder<{
										name: '';
										dataType: 'custom';
										columnType: 'SQLiteCustomColumn';
										data: DateWithTimezone;
										driverParam: DateWithTimezoneString;
										enumValues: undefined;
									}>
								: NotNull<
										SQLiteCustomColumnBuilder<{
											name: '';
											dataType: 'custom';
											columnType: 'SQLiteCustomColumn';
											data: DateWithTimezone;
											driverParam: DateWithTimezoneString;
											enumValues: undefined;
										}>
									>
							: C extends SelectColumnSchema<infer TOptions, infer TNullable>
								? TNullable extends true
									? SQLiteTextBuilderInitial<
											'',
											[...TOptions],
											number | undefined
										>
									: NotNull<
											SQLiteTextBuilderInitial<
												'',
												[...TOptions],
												number | undefined
											>
										>
								: C extends TagsColumnSchema<
											infer TOptions,
											infer TNullable
										>
									? TNullable extends true
										? SQLiteCustomColumnBuilder<{
												name: '';
												dataType: 'custom';
												columnType: 'SQLiteCustomColumn';
												data: TOptions[number][];
												driverParam: string;
												enumValues: undefined;
											}>
										: NotNull<
												SQLiteCustomColumnBuilder<{
													name: '';
													dataType: 'custom';
													columnType: 'SQLiteCustomColumn';
													data: TOptions[number][];
													driverParam: string;
													enumValues: undefined;
												}>
											>
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
			let column = date();
			if (!schema.nullable) column = column.notNull();
			return column as ColumnToDrizzle<C>;
		}

		case 'select': {
			// Select stored as TEXT (single value)
			let column = text(columnName, { enum: schema.options });
			if (!schema.nullable) column = column.notNull();
			if (schema.default !== undefined) {
				column = column.default(schema.default);
			}
			return column as ColumnToDrizzle<C>;
		}

		case 'multi-select': {
			// Tags column stored as TEXT with JSON mode (array of strings)
			let column: any = schema.options ? tags({ options: schema.options }) : tags();
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
