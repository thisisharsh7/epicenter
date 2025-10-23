import { Database } from '@tursodatabase/database/compat';
import { eq, sql } from 'drizzle-orm';
import {
	type BetterSQLite3Database,
	drizzle,
} from 'drizzle-orm/better-sqlite3';
import { type SQLiteTable, getTableConfig } from 'drizzle-orm/sqlite-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Ok, tryAsync } from 'wellcrafted/result';
import { IndexErr } from '../../core/errors';
import { defineIndex } from '../../core/indexes';
import type {
	WorkspaceSchema
} from '../../core/schema';
import { serializeRow } from '../../core/schema';
import type { Db } from '../../db/core';
import { EPICENTER_STORAGE_DIR } from '../../persistence/desktop';
import { convertWorkspaceSchemaToDrizzle } from './schema-converter';

/**
 * SQLite index configuration
 */
export type SQLiteIndexConfig = {
	/**
	 * Use in-memory database instead of persistent file storage.
	 *
	 * By default, the SQLite index uses the workspace ID as the database filename
	 * (stored in .epicenter/[workspace-id].db). Set this to true to use an in-memory
	 * database instead, which is useful for testing or temporary data.
	 *
	 * @default false
	 */
	inMemory?: boolean;
};


/**
 * Create SQLite tables if they don't exist
 * Uses Drizzle's official getTableConfig API for introspection
 */
async function createTablesIfNotExist<
	TSchema extends Record<string, SQLiteTable>,
>(db: BetterSQLite3Database<TSchema>, drizzleTables: TSchema): Promise<void> {
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
 * Syncs YJS changes to a SQLite database and exposes Drizzle query interface.
 *
 * The database is automatically named using the workspace ID, ensuring uniqueness
 * across workspaces. The file is stored at `.epicenter/[workspace-id].db`.
 *
 * This index creates internal resources (sqliteDb, drizzleTables) and exports them
 * via defineIndex(). All exported resources become available in your workspace actions
 * via the `indexes` parameter.
 *
 * @param db - Epicenter database instance
 * @param config - SQLite configuration options
 *
 * @example
 * ```typescript
 * // In workspace definition:
 * indexes: {
 *   sqlite: (db) => sqliteIndex(db),  // Uses workspace ID automatically
 * },
 *
 * actions: ({ indexes }) => ({
 *   // Access exported resources from the index
 *   getPost: defineQuery({
 *     handler: async ({ id }) => {
 *       // indexes.sqlite.db is the exported Drizzle database instance
 *       // indexes.sqlite.posts is the exported Drizzle table
 *       return await indexes.sqlite.db
 *         .select()
 *         .from(indexes.sqlite.posts)
 *         .where(eq(indexes.sqlite.posts.id, id));
 *     }
 *   })
 * })
 * ```
 */
export async function sqliteIndex<TSchema extends WorkspaceSchema>(
	db: Db<TSchema>,
	{ inMemory = false }: SQLiteIndexConfig = {},
) {
	// Convert table schemas to Drizzle tables
	const drizzleTables = convertWorkspaceSchemaToDrizzle(db.schema);

	// Determine database path: use workspace ID for uniqueness
	let resolvedDatabasePath: string;
	if (inMemory) {
		resolvedDatabasePath = ':memory:';
	} else {
		// Use workspace ID (from ydoc.guid) as the database filename
		const workspaceId = db.ydoc.guid;
		const databaseFilename = `${workspaceId}.db`;

		// Create .epicenter directory if it doesn't exist
		await mkdir(EPICENTER_STORAGE_DIR, { recursive: true });

		// Join filename with .epicenter directory
		resolvedDatabasePath = join(EPICENTER_STORAGE_DIR, databaseFilename);
	}

	// Create database connection with schema for proper type inference
	// Using lazy connection - Database will auto-connect on first query
	const client = new Database(resolvedDatabasePath);
	const sqliteDb = drizzle({ client, schema: drizzleTables });

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
						const serializedRow = serializeRow(row);
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
						const serializedRow = serializeRow(row);
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

	// Initial sync: YJS → SQLite (blocking to ensure tables exist before queries)
	await createTablesIfNotExist(sqliteDb, drizzleTables);

	for (const tableName of db.getTableNames()) {
		const drizzleTable = drizzleTables[tableName];
		if (!drizzleTable) {
			throw new Error(`Drizzle table for "${tableName}" not found`);
		}

		const results = db.tables[tableName]!.getAll();
		const rows = results.filter((r) => r.status === 'valid').map((r) => r.row);

		for (const row of rows) {
			const { error } = await tryAsync({
				try: async () => {
					const serializedRow = serializeRow(row);
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

	// Return destroy function alongside exported resources (flattened structure)
	return defineIndex({
		destroy() {
			for (const unsub of unsubscribers) {
				unsub();
			}
		},
		db: sqliteDb,
		...drizzleTables,
	});
}
