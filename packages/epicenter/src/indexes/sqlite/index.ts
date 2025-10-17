import { createClient } from '@libsql/client';
import { eq, sql } from 'drizzle-orm';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { getTableConfig, type SQLiteTable } from 'drizzle-orm/sqlite-core';
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
export type SQLiteIndexConfig = {
	/**
	 * Database URL for SQLite
	 * Can be a file path (./data/db.sqlite) or :memory: for in-memory
	 */
	databaseUrl?: string;
};

/**
 * Maps a Row type to SQLite-compatible types
 * Converts Y.Text, Y.Array<string>, and DateWithTimezone to string
 */
export type SQLiteRow<T extends Row = Row> = {
	[K in keyof T]: T[K] extends Y.Text
		? string
		: T[K] extends Y.Text | null
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
 * Converts Y.Text, Y.Array<string>, and DateWithTimezone to their string representations
 */
function serializeRowForSQLite<T extends Row>(row: T): SQLiteRow<T> {
	const serialized: Record<string, any> = {};

	for (const [key, value] of Object.entries(row)) {
		if (value instanceof Y.Text) {
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
 * Uses Drizzle's official getTableConfig API for introspection
 */
async function createTablesIfNotExist<TSchema extends Record<string, SQLiteTable>>(
	db: LibSQLDatabase<TSchema>,
	drizzleTables: TSchema,
): Promise<void> {
	for (const drizzleTable of Object.values(drizzleTables)) {
		const tableConfig = getTableConfig(drizzleTable);
		const columnDefs: string[] = [];

		for (const column of tableConfig.columns) {
			// Use column.getSQLType() to get the SQL type directly
			const sqlType = column.getSQLType();

			let constraints = '';
			if (column.notNull) {
				constraints += ' NOT NULL';
			}
			if (column.primary) {
				constraints += ' PRIMARY KEY';
			}
			if (column.isUnique) {
				constraints += ' UNIQUE';
			}

			columnDefs.push(`${column.name} ${sqlType}${constraints}`);
		}

		const createTableSQL = `CREATE TABLE IF NOT EXISTS ${tableConfig.name} (${columnDefs.join(', ')})`;
		await db.run(sql.raw(createTableSQL));
	}
}

/**
 * Create a SQLite index
 * Syncs YJS changes to a SQLite database and exposes Drizzle query interface
 *
 * @param db - Epicenter database instance (for type inference only)
 * @param config - SQLite configuration options
 */
export function sqliteIndex<TWorkspaceSchema extends WorkspaceSchema>(
	db: Db<TWorkspaceSchema>,
	{ databaseUrl = ':memory:' }: SQLiteIndexConfig = {},
): Index<
	{
		db: LibSQLDatabase<WorkspaceSchemaToDrizzleTables<TWorkspaceSchema>>;
	} & WorkspaceSchemaToDrizzleTables<TWorkspaceSchema>
> {
	// Convert table schemas to Drizzle tables
	const drizzleTables = convertWorkspaceSchemaToDrizzle(db.schema);

	// Create database connection with schema for proper type inference
	const sqliteDb = drizzle(
		createClient({ url: databaseUrl }),
		{ schema: drizzleTables },
	);

	// Set up observers for each table
	const unsubscribers: Array<() => void> = [];

	for (const tableName of db.getTableNames()) {
		const drizzleTable = drizzleTables[tableName];
		if (!drizzleTable) {
			throw new Error(`Drizzle table for "${tableName}" not found`);
		}

		const unsub = db.tables[tableName]!.observe({
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

		for (const tableName of db.getTableNames()) {
			const drizzleTable = drizzleTables[tableName];
			if (!drizzleTable) {
				throw new Error(`Drizzle table for "${tableName}" not found`);
			}

			const { valid: rows } = db.tables[tableName]!.getAll();

			for (const row of rows) {
				const { error } = await tryAsync({
					try: async () => {
						const serializedRow = serializeRowForSQLite(row);
						await sqliteDb.insert(drizzleTable as any).values(serializedRow);
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

	// Return dispose function alongside exported resources (flattened structure)
	return {
		[Symbol.dispose]() {
			for (const unsub of unsubscribers) {
				unsub();
			}
		},
		db: sqliteDb,
		...drizzleTables,
	};
}
