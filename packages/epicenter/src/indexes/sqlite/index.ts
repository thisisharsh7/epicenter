import { createClient } from '@libsql/client';
import { eq, sql } from 'drizzle-orm';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { tryAsync, Ok } from 'wellcrafted/result';
import * as Y from 'yjs';
import type {
	DateWithTimezone,
	Row,
	WorkspaceSchema,
} from '../../core/schema';
import { DateWithTimezoneSerializer } from './builders';
import { IndexErr } from '../../core/errors';
import { defineIndex, type Index } from '../../core/indexes';
import type { Db } from '../../db/core';
import {
	convertWorkspaceSchemaToDrizzle,
	type WorkspaceSchemaToDrizzleTables,
} from './schema-converter';

/**
 * SQLite index configuration
 */
export type SQLiteIndexConfig<TWorkspaceSchema extends WorkspaceSchema = WorkspaceSchema> = {
	/**
	 * Database instance with schema
	 * Required for type inference
	 */
	db: Db<TWorkspaceSchema>;
	/**
	 * Database URL for SQLite
	 * Can be a file path (./data/db.sqlite) or :memory: for in-memory
	 */
	databaseUrl?: string;
};

/**
 * Maps a Row type to SQLite-compatible types
 * Converts Y.Text, Y.XmlFragment, Y.Array<string>, and DateWithTimezone to string
 */
export type SQLiteRow<T extends Row = Row> = {
	[K in keyof T]: T[K] extends Y.Text | Y.XmlFragment
		? string
		: T[K] extends Y.Text | Y.XmlFragment | null
			? string | null
			: T[K] extends Y.Array<string>
				? string
				: T[K] extends Y.Array<string> | null
					? string | null
					: T[K] extends DateWithTimezone
						? string
						: T[K] extends DateWithTimezone | null
							? string | null
							: T[K];
};

/**
 * Serialize Y.js types and DateWithTimezone to plain text for SQLite storage
 * Converts Y.Text, Y.XmlFragment, Y.Array<string>, and DateWithTimezone to their string representations
 */
function serializeRowForSQLite<T extends Row>(row: T): SQLiteRow<T> {
	const serialized: Record<string, any> = {};

	for (const [key, value] of Object.entries(row)) {
		if (value instanceof Y.Text || value instanceof Y.XmlFragment) {
			// Convert Y.js types to plain text (lossy conversion)
			serialized[key] = value.toString();
		} else if (value instanceof Y.Array) {
			// Convert Y.Array to JSON string
			serialized[key] = JSON.stringify(value.toArray());
			// Equivalent to isDateWithTimezone(value) but faster due to above checks that narrow value type
		} else if (typeof value === 'object' && value !== null) {
			// Convert DateWithTimezone to "ISO_UTC|TIMEZONE" format
			serialized[key] = DateWithTimezoneSerializer.serialize(value);
		} else {
			serialized[key] = value;
		}
	}

	return serialized as SQLiteRow<T>;
}

/**
 * Create SQLite tables if they don't exist
 */
async function createTablesIfNotExist<TSchema extends Record<string, SQLiteTable>>(
	db: LibSQLDatabase<TSchema>,
	drizzleTables: TSchema,
): Promise<void> {
	for (const [tableName, drizzleTable] of Object.entries(drizzleTables)) {
		// Extract column definitions from Drizzle table
		const columns = (drizzleTable as any)[Symbol.for('drizzle:Columns')];
		const columnDefs: string[] = [];

		for (const [columnName, column] of Object.entries(columns)) {
			const config = (column as any).config;
			const columnType = config.columnType;

			let sqlType = 'TEXT';
			if (
				columnType === 'SQLiteInteger' ||
				columnType === 'SQLiteTimestamp' ||
				columnType === 'SQLiteBoolean'
			) {
				sqlType = 'INTEGER';
			} else if (columnType === 'SQLiteReal') {
				sqlType = 'REAL';
			} else if (columnType === 'SQLiteNumeric') {
				sqlType = 'NUMERIC';
			} else if (columnType === 'SQLiteBlob') {
				sqlType = 'BLOB';
			}

			let constraints = '';
			if (config.notNull === true) {
				constraints += ' NOT NULL';
			}
			if (config.primaryKey === true) {
				constraints += ' PRIMARY KEY';
			}
			if (config.isUnique === true) {
				constraints += ' UNIQUE';
			}

			columnDefs.push(`${columnName} ${sqlType}${constraints}`);
		}

		const createTableSQL = `CREATE TABLE IF NOT EXISTS ${tableName} (${columnDefs.join(', ')})`;
		await db.run(sql.raw(createTableSQL));
	}
}

/**
 * Create a SQLite index
 * Syncs YJS changes to a SQLite database and exposes Drizzle query interface
 */
export function sqliteIndex<TWorkspaceSchema extends WorkspaceSchema>({
	db: _db,
	databaseUrl = ':memory:',
}: SQLiteIndexConfig<TWorkspaceSchema>): Index<
	TWorkspaceSchema,
	{
		db: LibSQLDatabase<WorkspaceSchemaToDrizzleTables<TWorkspaceSchema>> & { $client: any };
	} & WorkspaceSchemaToDrizzleTables<TWorkspaceSchema>
> {
	return defineIndex({
		init: (epicenterDb: Db<TWorkspaceSchema>): {
			destroy: () => void;
		} & {
			db: LibSQLDatabase<WorkspaceSchemaToDrizzleTables<TWorkspaceSchema>> & { $client: any };
		} & WorkspaceSchemaToDrizzleTables<TWorkspaceSchema> => {
			// Convert table schemas to Drizzle tables
			const drizzleTables = convertWorkspaceSchemaToDrizzle(epicenterDb.schema);

			// Create database connection with schema for proper type inference
			const sqliteDb = drizzle(
				createClient({ url: databaseUrl }),
				{ schema: drizzleTables },
			);

			// Set up observers for each table
			const unsubscribers: Array<() => void> = [];

			for (const tableName of epicenterDb.getTableNames()) {
				const drizzleTable = drizzleTables[tableName];
				if (!drizzleTable) {
					throw new Error(`Drizzle table for "${tableName}" not found`);
				}

				const unsub = epicenterDb.tables[tableName]!.observe({
					onAdd: async (row) => {
						const { error } = await tryAsync({
							try: async () => {
								const serializedRow = serializeRowForSQLite(row);
								await sqliteDb.insert(drizzleTable as any).values(serializedRow);
							},
							catch: () => Ok(undefined),
						});

						if (error) {
							console.error(
								IndexErr({
									message: `SQLite index onAdd failed for ${tableName}/${row.id}`,
									context: { tableName, id: row.id, data: row },
									cause: error,
								}),
							);
						}
					},
					onUpdate: async (row) => {
						const { error } = await tryAsync({
							try: async () => {
								const serializedRow = serializeRowForSQLite(row);
								await sqliteDb
									.update(drizzleTable as any)
									.set(serializedRow)
									.where(eq((drizzleTable as any).id, row.id));
							},
							catch: () => Ok(undefined),
						});

						if (error) {
							console.error(
								IndexErr({
									message: `SQLite index onUpdate failed for ${tableName}/${row.id}`,
									context: { tableName, id: row.id, data: row },
									cause: error,
								}),
							);
						}
					},
					onDelete: async (id) => {
						const { error } = await tryAsync({
							try: async () => {
								await sqliteDb
									.delete(drizzleTable as any)
									.where(eq((drizzleTable as any).id, id));
							},
							catch: () => Ok(undefined),
						});

						if (error) {
							console.error(
								IndexErr({
									message: `SQLite index onDelete failed for ${tableName}/${id}`,
									context: { tableName, id },
									cause: error,
								}),
							);
						}
					},
				});
				unsubscribers.push(unsub);
			}

			// Initial sync: YJS → SQLite
			(async () => {
				await createTablesIfNotExist(sqliteDb, drizzleTables);

				for (const tableName of epicenterDb.getTableNames()) {
					const drizzleTable = drizzleTables[tableName];
				if (!drizzleTable) {
					throw new Error(`Drizzle table for "${tableName}" not found`);
				}

				const { valid: rows } = epicenterDb.tables[tableName]!.getAll();

					for (const row of rows) {
						const { error } = await tryAsync({
							try: async () => {
								const serializedRow = serializeRowForSQLite(row);
								await sqliteDb
									.insert(drizzleTable as any)
									.values(serializedRow);
							},
							catch: () => Ok(undefined),
						});

						if (error) {
							console.warn(
								`Failed to sync row ${row.id} to SQLite during init:`,
								error,
							);
						}
					}
				}
			})();

			// Return destroy function alongside exported resources (flattened structure)
			return {
				destroy() {
					for (const unsub of unsubscribers) {
						unsub();
					}
				},
				db: sqliteDb,
				...drizzleTables,
			};
		},
	});
}
