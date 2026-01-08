import slugify from '@sindresorhus/slugify';
import type { StandardSchemaV1 } from '../standard/types';
import type { $Type, IsPrimaryKey, NotNull } from 'drizzle-orm';
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
import { date, json, tags } from '../../../capabilities/sqlite/builders';
import type { DateTimeString } from '../fields/datetime';
import type {
	BooleanFieldSchema,
	FieldSchema,
	FieldsSchema,
	DateFieldSchema,
	IdFieldSchema,
	IntegerFieldSchema,
	JsonFieldSchema,
	RealFieldSchema,
	RichtextFieldSchema,
	SelectFieldSchema,
	TagsFieldSchema,
	TextFieldSchema,
} from '../fields/types';

import { isNullableFieldSchema } from '../fields/helpers';

function capitalize(str: string): string {
	return str
		.split(/[_-]/)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

export function toSqlIdentifier(displayName: string): string {
	return slugify(displayName, { separator: '_' });
}

/**
 * Maps a workspace schema to its Drizzle table representations.
 *
 * Use this type when you need to reference the return type of
 * `convertWorkspaceSchemaToDrizzle` in your type definitions.
 *
 * @typeParam TWorkspaceSchema - The workspace schema containing all table definitions
 *
 * @example
 * ```typescript
 * const schema = {
 *   users: { id: id(), name: text() },
 *   posts: { id: id(), title: text() },
 * };
 *
 * // Type for the resulting Drizzle tables
 * type MyTables = WorkspaceSchemaToDrizzleTables<typeof schema>;
 * // { users: SQLiteTable, posts: SQLiteTable }
 * ```
 */
export type WorkspaceSchemaToDrizzleTables<
	TWorkspaceSchema extends Record<string, FieldsSchema>,
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
 * Use this when setting up the SQLite provider to create type-safe table
 * references for Drizzle ORM queries.
 *
 * @param schema - The workspace schema containing all table definitions
 * @returns A record mapping table names to their Drizzle SQLiteTable representations
 *
 * @example
 * ```typescript
 * const schema = {
 *   users: { id: id(), name: text() },
 *   posts: { id: id(), title: text(), authorId: text() },
 * };
 *
 * const tables = convertWorkspaceSchemaToDrizzle(schema);
 *
 * // Use with Drizzle queries
 * const allUsers = await db.select().from(tables.users);
 * const userPosts = await db
 *   .select()
 *   .from(tables.posts)
 *   .where(eq(tables.posts.authorId, userId));
 * ```
 */
export function convertWorkspaceSchemaToDrizzle<
	TWorkspaceSchema extends Record<string, FieldsSchema>,
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
 * Use this when you need to create a Drizzle table for a single table schema,
 * rather than an entire workspace. Useful for testing or when working with
 * individual tables in isolation.
 *
 * @param tableName - The name of the table (used in SQL)
 * @param fieldsSchema - The schema defining all columns for this table
 * @returns A Drizzle SQLiteTable with typed columns
 *
 * @example
 * ```typescript
 * const usersTable = convertTableSchemaToDrizzle('users', {
 *   id: id(),
 *   name: text(),
 *   age: integer({ nullable: true }),
 * });
 *
 * // Use with Drizzle queries
 * const adults = await db
 *   .select()
 *   .from(usersTable)
 *   .where(gte(usersTable.age, 18));
 * ```
 */
export function convertTableSchemaToDrizzle<
	TTableName extends string,
	TFieldsSchema extends FieldsSchema,
>(tableName: TTableName, fieldsSchema: TFieldsSchema) {
	const columns = Object.fromEntries(
		Object.keys(fieldsSchema).map((fieldKey) => {
			const schema = fieldsSchema[fieldKey as keyof TFieldsSchema]!;
			const displayName = schema.name ?? capitalize(fieldKey);
			const sqlColumnName = toSqlIdentifier(displayName);
			return [fieldKey, convertFieldSchemaToDrizzle(sqlColumnName, schema)];
		}),
	) as { [Key in keyof TFieldsSchema]: FieldToDrizzle<TFieldsSchema[Key]> };

	return sqliteTable(tableName, columns);
}

type FieldToDrizzle<C extends FieldSchema> = C extends IdFieldSchema
	? IsPrimaryKey<
			NotNull<SQLiteTextBuilderInitial<'', [string, ...string[]], undefined>>
		>
	: C extends TextFieldSchema<infer TNullable>
		? TNullable extends true
			? SQLiteTextBuilderInitial<'', [string, ...string[]], undefined>
			: NotNull<SQLiteTextBuilderInitial<'', [string, ...string[]], undefined>>
		: C extends RichtextFieldSchema
			? SQLiteTextBuilderInitial<'', [string, ...string[]], undefined>
			: C extends IntegerFieldSchema<infer TNullable>
				? TNullable extends true
					? SQLiteIntegerBuilderInitial<''>
					: NotNull<SQLiteIntegerBuilderInitial<''>>
				: C extends RealFieldSchema<infer TNullable>
					? TNullable extends true
						? SQLiteRealBuilderInitial<''>
						: NotNull<SQLiteRealBuilderInitial<''>>
					: C extends BooleanFieldSchema<infer TNullable>
						? TNullable extends true
							? SQLiteBooleanBuilderInitial<''>
							: NotNull<SQLiteBooleanBuilderInitial<''>>
						: C extends DateFieldSchema<infer TNullable>
							? TNullable extends true
								? $Type<
										SQLiteTextBuilderInitial<
											'',
											[string, ...string[]],
											undefined
										>,
										DateTimeString
									>
								: NotNull<
										$Type<
											SQLiteTextBuilderInitial<
												'',
												[string, ...string[]],
												undefined
											>,
											DateTimeString
										>
									>
							: C extends SelectFieldSchema<infer TOptions, infer TNullable>
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
								: C extends TagsFieldSchema<infer TOptions, infer TNullable>
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
									: C extends JsonFieldSchema<infer TSchema, infer TNullable>
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

function convertFieldSchemaToDrizzle<C extends FieldSchema>(
	columnName: string,
	schema: C,
): FieldToDrizzle<C> {
	const isNullable = isNullableFieldSchema(schema);

	switch (schema.type) {
		case 'id':
			return text(columnName).primaryKey().notNull() as FieldToDrizzle<C>;

		case 'text': {
			let column = text(columnName);
			if (!isNullable) column = column.notNull();
			if (schema.default !== undefined) {
				column = column.default(schema.default);
			}
			return column as FieldToDrizzle<C>;
		}

		case 'richtext': {
			let column = text(columnName);
			if (!isNullable) column = column.notNull();
			return column as FieldToDrizzle<C>;
		}

		case 'integer': {
			let column = integer(columnName);
			if (!isNullable) column = column.notNull();
			if (schema.default !== undefined) {
				column = column.default(schema.default);
			}
			return column as FieldToDrizzle<C>;
		}

		case 'real': {
			let column = real(columnName);
			if (!isNullable) column = column.notNull();
			if (schema.default !== undefined) {
				column = column.default(schema.default);
			}
			return column as FieldToDrizzle<C>;
		}

		case 'boolean': {
			let column = integer(columnName, { mode: 'boolean' });
			if (!isNullable) column = column.notNull();
			if (schema.default !== undefined) {
				column = column.default(schema.default);
			}
			return column as FieldToDrizzle<C>;
		}

		case 'date': {
			const column = date({
				nullable: isNullable,
				default: schema.default,
			});
			return column as unknown as FieldToDrizzle<C>;
		}

		case 'select': {
			let column = text(columnName, { enum: [...schema.options] });
			if (!isNullable) column = column.notNull();
			if (schema.default !== undefined) {
				column = column.default(schema.default);
			}
			return column as FieldToDrizzle<C>;
		}

		case 'tags': {
			const column = tags({
				options: schema.options,
				nullable: isNullable,
				default: schema.default,
			});
			return column as FieldToDrizzle<C>;
		}

		case 'json': {
			const column = json({
				schema: schema.schema,
				nullable: isNullable,
				default: schema.default,
			});
			return column as FieldToDrizzle<C>;
		}

		default:
			throw new Error(`Unknown field type: ${(schema as FieldSchema).type}`);
	}
}
