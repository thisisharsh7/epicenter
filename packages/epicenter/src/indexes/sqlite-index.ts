import { createClient } from '@libsql/client';
import { eq, sql } from 'drizzle-orm';
import { type LibSQLDatabase, drizzle } from 'drizzle-orm/libsql';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { Ok, tryAsync } from 'wellcrafted/result';
import { IndexErr } from '../core/errors';
import type { Index, IndexContext } from '../core/indexes';
import { convertAllTableSchemasToDrizzle } from './schema-converter';

/**
 * SQLite index configuration
 */
export type SQLiteIndexConfig = IndexContext & {
	/**
	 * Database URL for SQLite
	 * Can be a file path (./data/db.sqlite) or :memory: for in-memory
	 */
	databaseUrl?: string;
};

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
export function createSQLiteIndex(config: SQLiteIndexConfig): Index {
	// Convert table schemas to Drizzle tables
	const drizzleTables = convertAllTableSchemasToDrizzle(config.db.schema);

	// Create database connection
	const db = drizzle(
		createClient({
			url: config.databaseUrl || ':memory:',
		}),
	);

	const index: Index & {
		db: LibSQLDatabase;
		[tableName: string]: any;
	} = {
		async init() {
			// Create tables
			await createTablesIfNotExist(db, drizzleTables);

			// Initial sync: YJS → SQLite
			for (const tableName of config.db.getTableNames()) {
				const rows = config.db.tables[tableName].getAll();

				for (const data of rows) {
					const { error } = await tryAsync({
						try: async () => {
							await db.insert(drizzleTables[tableName]).values(data);
						},
						catch: (err) => err,
					});

					if (error) {
						console.warn(
							`Failed to sync row ${data.id} to SQLite during init:`,
							error,
						);
					}
				}
			}
		},

		async onAdd(tableName, id, data) {
			const { error } = await tryAsync({
				try: async () => {
					await db.insert(drizzleTables[tableName]).values(data);
				},
				catch: (err) => err,
			});

			if (error) {
				return IndexErr({
					message: `SQLite index onAdd failed for ${tableName}/${id}`,
					context: { tableName, id, data },
					cause: error,
				});
			}
			return Ok(undefined);
		},

		async onUpdate(tableName, id, data) {
			const { error } = await tryAsync({
				try: async () => {
					await db
						.update(drizzleTables[tableName])
						.set(data)
						.where(eq((drizzleTables[tableName] as any).id, id));
				},
				catch: (err) => err,
			});

			if (error) {
				return IndexErr({
					message: `SQLite index onUpdate failed for ${tableName}/${id}`,
					context: { tableName, id, data },
					cause: error,
				});
			}
			return Ok(undefined);
		},

		async onDelete(tableName, id) {
			const { error } = await tryAsync({
				try: async () => {
					await db
						.delete(drizzleTables[tableName])
						.where(eq((drizzleTables[tableName] as any).id, id));
				},
				catch: (err) => err,
			});

			if (error) {
				return IndexErr({
					message: `SQLite index onDelete failed for ${tableName}/${id}`,
					context: { tableName, id },
					cause: error,
				});
			}
			return Ok(undefined);
		},

		async destroy() {
			// Cleanup if needed
		},

		// Expose database and tables for queries
		db,
	};

	// Add each table as a property for clean API: indexes.sqlite.posts.select()
	for (const [tableName, drizzleTable] of Object.entries(drizzleTables)) {
		index[tableName] = drizzleTable;
	}

	return index;
}
