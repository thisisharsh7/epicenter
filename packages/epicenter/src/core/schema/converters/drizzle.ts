import type { StandardSchemaV1 } from '../standard-schema';
import type { IsPrimaryKey, NotNull } from 'drizzle-orm';
import {
	integer,
	real,
	type SQLiteBooleanBuilderInitial,
	type SQLiteCustomColumnBuilder,
	type SQLiteIntegerBuilderInitial,
	type SQLiteRealBuilderInitial,
	type SQLiteTable,
	type SQLiteTextBuilderInitial,
	sqliteTable,
	text,
} from 'drizzle-orm/sqlite-core';
import { date, json, tags } from '../../../providers/sqlite/schema/builders';
import type {
	BooleanColumnSchema,
	ColumnSchema,
	DateColumnSchema,
	DateWithTimezone,
	DateWithTimezoneString,
	IdColumnSchema,
	IntegerColumnSchema,
	JsonColumnSchema,
	RealColumnSchema,
	SelectColumnSchema,
	TableSchema,
	TagsColumnSchema,
	TextColumnSchema,
	WorkspaceSchema,
	YtextColumnSchema,
} from '../../schema';
import { isNullableColumnSchema } from '../nullability';

/**
 * Maps a WorkspaceSchema to its Drizzle table representations.
 *
 * This type preserves the table names as keys and maps each TableSchema
 * to its corresponding SQLiteTable type with full column type information.
 *
 * @typeParam TWorkspaceSchema - The workspace schema containing all table definitions
 *
 * @remarks
 * The `& string` intersection is required because TypeScript conservatively types
 * `keyof TWorkspaceSchema` as `string | number | symbol` even though
 * WorkspaceSchema = Record<string, TableSchema>. The intersection narrows
 * the type to satisfy convertTableSchemaToDrizzle's string constraint.
 */
export type WorkspaceSchemaToDrizzleTables<
	TWorkspaceSchema extends WorkspaceSchema,
> = {
	[K in keyof TWorkspaceSchema & string]: ReturnType<
		typeof convertTableSchemaToDrizzle<K, TWorkspaceSchema[K]>
	>;
};

/**
 * Convert a workspace schema to Drizzle SQLite tables.
 *
 * This is the main entry point for converting a complete workspace schema
 * (which may contain multiple tables) into Drizzle table definitions that
 * can be used for database operations.
 *
 * @param schema - The workspace schema containing all table definitions
 * @returns A record mapping table names to their Drizzle SQLiteTable representations
 *
 * @example
 * ```ts
 * const schema = {
 *   users: { id: { type: 'id' }, name: { type: 'text' } },
 *   posts: { id: { type: 'id' }, title: { type: 'text' } },
 * };
 * const tables = convertWorkspaceSchemaToDrizzle(schema);
 * // tables.users and tables.posts are now SQLiteTable instances
 * ```
 */
export function convertWorkspaceSchemaToDrizzle<
	TWorkspaceSchema extends WorkspaceSchema,
>(schema: TWorkspaceSchema): WorkspaceSchemaToDrizzleTables<TWorkspaceSchema> {
	const result: Record<string, SQLiteTable> = {};

	for (const tableName of Object.keys(schema)) {
		const tableSchema = schema[tableName];
		if (!tableSchema) {
			throw new Error(`Table schema for "${tableName}" is undefined`);
		}
		result[tableName] = convertTableSchemaToDrizzle(tableName, tableSchema);
	}

	return result as WorkspaceSchemaToDrizzleTables<TWorkspaceSchema>;
}

/**
 * Convert a single table schema to a Drizzle SQLiteTable.
 *
 * Takes a table name and its column schema definitions, then creates
 * a Drizzle table with all columns properly typed and configured.
 *
 * @param tableName - The name of the table (used in SQL)
 * @param tableSchema - The schema defining all columns for this table
 * @returns A Drizzle SQLiteTable with typed columns
 *
 * @example
 * ```ts
 * const usersTable = convertTableSchemaToDrizzle('users', {
 *   id: { type: 'id' },
 *   name: { type: 'text' },
 *   age: { type: 'integer', nullable: true },
 * });
 * ```
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
 * Maps a ColumnSchema to its corresponding Drizzle column builder type.
 *
 * This conditional type chain determines the exact Drizzle type for each
 * column schema variant. It handles:
 * - NotNull wrapper when nullable is false
 * - Custom column types for date, tags, and json
 * - Drizzle's built-in types for primitives (text, integer, real, boolean)
 *
 * The type uses nested conditional types to match against each possible
 * column schema type in order: id → text → ytext → integer → real →
 * boolean → date → select → multi-select → json → never
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
								: C extends TagsColumnSchema<infer TOptions, infer TNullable>
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
									: C extends JsonColumnSchema<infer TSchema, infer TNullable>
										? TNullable extends true
											? SQLiteCustomColumnBuilder<{
													name: '';
													dataType: 'custom';
													columnType: 'SQLiteCustomColumn';
													data: StandardSchemaV1.InferOutput<TSchema>;
													driverParam: string;
													enumValues: undefined;
												}>
											: NotNull<
													SQLiteCustomColumnBuilder<{
														name: '';
														dataType: 'custom';
														columnType: 'SQLiteCustomColumn';
														data: StandardSchemaV1.InferOutput<TSchema>;
														driverParam: string;
														enumValues: undefined;
													}>
												>
										: never;

/**
 * Convert a ColumnSchema to a Drizzle column builder.
 *
 * This function uses two distinct patterns depending on column complexity:
 *
 * **Pattern 1: Primitive Types (text, integer, real, boolean, select)**
 * Uses Drizzle's built-in column functions from `drizzle-orm/sqlite-core` and
 * explicitly chains `.notNull()` and `.default()`/`.$defaultFn()` based on schema.
 * This is necessary because Drizzle's primitives require the column name as
 * the first argument and don't accept a schema object.
 *
 * **Pattern 2: Custom Types (date, multi-select, json)**
 * Uses custom builders from `builders.ts` that accept the entire schema object.
 * These builders encapsulate complex serialization logic (timezone handling,
 * JSON array validation, arktype validation) and handle nullable/default internally.
 * The schema object is passed directly because it contains all the configuration
 * the builder needs (nullable, default, options, validation schema, etc.).
 *
 * @example
 * // Pattern 1: Primitive with explicit chaining
 * let column = text(columnName);
 * if (!schema.nullable) column = column.notNull();
 *
 * // Pattern 2: Custom builder with schema object
 * const column = date(schema); // nullable/default handled internally
 */
function convertColumnSchemaToDrizzle<C extends ColumnSchema>(
	columnName: string,
	schema: C,
): ColumnToDrizzle<C> {
	const isNullable = isNullableColumnSchema(schema);

	switch (schema['x-component']) {
		case 'id':
			return text(columnName).primaryKey().notNull() as ColumnToDrizzle<C>;

		case 'text': {
			let column = text(columnName);
			if (!isNullable) column = column.notNull();
			if (schema.default !== undefined) {
				column = column.default(schema.default);
			}
			return column as ColumnToDrizzle<C>;
		}

		case 'ytext': {
			let column = text(columnName);
			if (!isNullable) column = column.notNull();
			return column as ColumnToDrizzle<C>;
		}

		case 'integer': {
			let column = integer(columnName);
			if (!isNullable) column = column.notNull();
			if (schema.default !== undefined) {
				column = column.default(schema.default);
			}
			return column as ColumnToDrizzle<C>;
		}

		case 'real': {
			let column = real(columnName);
			if (!isNullable) column = column.notNull();
			if (schema.default !== undefined) {
				column = column.default(schema.default);
			}
			return column as ColumnToDrizzle<C>;
		}

		case 'boolean': {
			let column = integer(columnName, { mode: 'boolean' });
			if (!isNullable) column = column.notNull();
			if (schema.default !== undefined) {
				column = column.default(schema.default);
			}
			return column as ColumnToDrizzle<C>;
		}

		case 'date': {
			const column = date({ nullable: isNullable, default: schema.default });
			return column as ColumnToDrizzle<C>;
		}

		case 'select': {
			let column = text(columnName, { enum: [...schema.enum] });
			if (!isNullable) column = column.notNull();
			if (schema.default !== undefined) {
				column = column.default(schema.default);
			}
			return column as ColumnToDrizzle<C>;
		}

		case 'tags': {
			const column = tags({
				options: schema.items.enum,
				nullable: isNullable,
				default: schema.default,
			});
			return column as ColumnToDrizzle<C>;
		}

		case 'json': {
			const column = json({
				schema: schema.schema,
				nullable: isNullable,
				default: schema.default,
			});
			return column as ColumnToDrizzle<C>;
		}

		default:
			throw new Error(
				`Unknown column type: ${(schema as ColumnSchema)['x-component']}`,
			);
	}
}
