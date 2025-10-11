import { createClient } from '@libsql/client';
import { eq, sql } from 'drizzle-orm';
import { type LibSQLDatabase, drizzle } from 'drizzle-orm/libsql';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { tryAsync } from 'wellcrafted/result';
import * as Y from 'yjs';
import type { Row, Schema, TableSchema } from '../core/column-schemas';
import type { Db } from '../db/core';
import { IndexErr } from '../core/errors';
import type { Index } from '../core/indexes';
import { convertAllTableSchemasToDrizzle } from './schema-converter';

/**
 * SQLite index configuration
 */
export type SQLiteIndexConfig = {
	/**
	 * Database URL for SQLite
	 * Can be a file path (./data/db.sqlite) or :memory: for in-memory
	 */
	databaseUrl?: string;
};

/**
 * Maps a Row type to SQLite-compatible types
 * Converts Y.Text and Y.XmlFragment to string, preserves everything else
 */
export type SQLiteRow<T extends Row> = {
	[K in keyof T]: T[K] extends Y.Text | Y.XmlFragment
		? string
		: T[K] extends Y.Text | Y.XmlFragment | null
			? string | null
			: T[K];
};

/**
 * Serialize Y.js types to plain text for SQLite storage
 * Converts Y.Text and Y.XmlFragment to their string representations
 */
function serializeRowForSQLite<T extends Row>(row: T): SQLiteRow<T> {
	const serialized: Record<string, any> = {};

	for (const [key, value] of Object.entries(row)) {
		if (value instanceof Y.Text || value instanceof Y.XmlFragment) {
			// Convert Y.js types to plain text (lossy conversion)
			serialized[key] = value.toString();
		} else {
			serialized[key] = value;
		}
	}

	return serialized as SQLiteRow<T>;
}

/**
 * Create SQLite tables if they don't exist
 */
async function createTablesIfNotExist(
	db: LibSQLDatabase,
	drizzleTables: Record<string, SQLiteTable>,
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
export function createSQLiteIndex<
	TSchema extends Schema = Schema,
>(config: SQLiteIndexConfig) {
	return {
		id: 'sqlite' as const,
		init: (epicenterDb: Db<TSchema>) => {
		// Convert table schemas to Drizzle tables
		const drizzleTables = convertAllTableSchemasToDrizzle(epicenterDb.schema);

		// Create database connection
		const sqliteDb = drizzle(
			createClient({
				url: config.databaseUrl || ':memory:',
			}),
		);

		// Set up observers for each table
		const unsubscribers: Array<() => void> = [];

		for (const tableName of epicenterDb.getTableNames()) {
			const unsub = epicenterDb.tables[tableName].observe({
				onAdd: async (row) => {
					const { error } = await tryAsync({
						try: async () => {
							const serializedRow = serializeRowForSQLite(row);
							await sqliteDb.insert(drizzleTables[tableName]).values(serializedRow);
						},
						catch: (err) => err,
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
								.update(drizzleTables[tableName])
								.set(serializedRow)
								.where(eq((drizzleTables[tableName] as any).id, row.id));
						},
						catch: (err) => err,
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
								.delete(drizzleTables[tableName])
								.where(eq((drizzleTables[tableName] as any).id, id));
						},
						catch: (err) => err,
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
				const { valid: rows } = epicenterDb.tables[tableName].getAll();

				for (const row of rows) {
					const { error } = await tryAsync({
						try: async () => {
							const serializedRow = serializeRowForSQLite(row);
							await sqliteDb.insert(drizzleTables[tableName]).values(serializedRow);
						},
						catch: (err) => err,
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

		// Build queries object with db and table references
		const queries = {
			db: sqliteDb,
			...drizzleTables,
		};

		return {
			destroy() {
				for (const unsub of unsubscribers) {
					unsub();
				}
			},
			queries,
		};
		},
	};
}
