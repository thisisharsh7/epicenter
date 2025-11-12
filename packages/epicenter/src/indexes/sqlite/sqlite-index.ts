import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Database } from '@tursodatabase/database/compat';
import { eq, sql } from 'drizzle-orm';
import {
	type BetterSQLite3Database,
	drizzle,
} from 'drizzle-orm/better-sqlite3';
import { type SQLiteTable, getTableConfig } from 'drizzle-orm/sqlite-core';
import { extractErrorMessage } from 'wellcrafted/error';
import { Ok, tryAsync } from 'wellcrafted/result';
import { defineQuery } from '../../core/actions';
import { IndexErr, IndexError } from '../../core/errors';
import {
	type Index,
	type IndexContext,
	defineIndexExports,
} from '../../core/indexes';
import type { WorkspaceSchema } from '../../core/schema';
import { createIndexLogger } from '../error-logger';
import { convertWorkspaceSchemaToDrizzle } from './schema-converter';

/**
 * Bidirectional sync coordination state
 *
 * Prevents infinite loops during two-way synchronization between YJS (in-memory)
 * and SQLite database (on disk).
 *
 * The state ensures changes only flow in one direction at a time by tracking
 * which system is currently processing changes.
 */
type SyncCoordination = {
	/**
	 * True when pull operation is processing changes from SQLite to YJS
	 * YJS observers check this and skip processing to avoid the loop
	 */
	isProcessingSQLiteChange: boolean;

	/**
	 * True when push operation is processing changes from YJS to SQLite
	 * (Currently not checked since we don't have SQLite → YJS observers,
	 * but included for consistency with markdown index pattern)
	 */
	isProcessingYJSChange: boolean;
};

/**
 * Create a SQLite index
 * Syncs YJS changes to a SQLite database and exposes Drizzle query interface.
 *
 * This index creates internal resources (sqliteDb, drizzleTables) and exports them
 * via defineIndex(). All exported resources become available in your workspace actions
 * via the `indexes` parameter.
 *
 * **Storage**: Auto-saves to `.epicenter/{workspaceId}.db` relative to storageDir from epicenter config
 *
 * @param context - Index context with workspace ID, database instance, and storage directory
 *
 * @example
 * ```typescript
 * // In workspace definition:
 * indexes: {
 *   sqlite: (c) => sqliteIndex(c),  // Auto-saves to .epicenter/{id}.db
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
export const sqliteIndex = (async <TSchema extends WorkspaceSchema>({
	id,
	db,
	storageDir,
}: IndexContext<TSchema>) => {
	// Require Node.js environment with filesystem access
	if (!storageDir) {
		throw new Error(
			'SQLite index requires Node.js environment with filesystem access',
		);
	}

	// Convert table schemas to Drizzle tables
	const drizzleTables = convertWorkspaceSchemaToDrizzle(db.schema);

	// Set up storage paths
	const databasePath = path.join(storageDir, '.epicenter', `${id}.db`);
	await mkdir(path.dirname(databasePath), { recursive: true });

	// Create database connection with schema for proper type inference
	// WAL mode is enabled for better concurrent access
	// Using lazy connection - Database will auto-connect on first query
	const client = new Database(databasePath);
	client.exec('PRAGMA journal_mode = WAL');
	const sqliteDb = drizzle({ client, schema: drizzleTables });

	// Create error logger for this index
	const logPath = path.join(storageDir, '.epicenter', 'sqlite', `${id}.log`);
	const logger = createIndexLogger({ logPath });

	/**
	 * Coordination state to prevent infinite sync loops
	 *
	 * How it works:
	 * - Before pull operation: set isProcessingSQLiteChange = true
	 *   - YJS observers check this and skip processing
	 * - Before push operation: set isProcessingYJSChange = true
	 *   - (Not currently checked, but consistent with pattern)
	 */
	const syncCoordination: SyncCoordination = {
		isProcessingSQLiteChange: false,
		isProcessingYJSChange: false,
	};

	// Set up observers for each table
	const unsubscribers: Array<() => void> = [];

	for (const tableName of db.getTableNames()) {
		const drizzleTable = drizzleTables[tableName];
		if (!drizzleTable) {
			throw new Error(`Drizzle table for "${tableName}" not found`);
		}

		const unsub = db.tables[tableName].observe({
			onAdd: async (row) => {
				// Skip if this YJS change was triggered by a SQLite change we're processing
				// (prevents SQLite -> YJS -> SQLite infinite loop during pull)
				if (syncCoordination.isProcessingSQLiteChange) return;

				const { error } = await tryAsync({
					try: async () => {
						const serializedRow = row.toJSON();
						await sqliteDb.insert(drizzleTable).values(serializedRow);
					},
					catch: () => Ok(undefined),
				});

				if (error) {
					await logger.log(
						IndexError({
							message: `SQLite index onAdd failed for ${tableName}/${row.id}`,
							context: { tableName, id: row.id, data: row },
							cause: error,
						}),
					);
				}
			},
			onUpdate: async (row) => {
				// Skip if this YJS change was triggered by a SQLite change we're processing
				// (prevents SQLite -> YJS -> SQLite infinite loop during pull)
				if (syncCoordination.isProcessingSQLiteChange) return;

				const { error } = await tryAsync({
					try: async () => {
						const serializedRow = row.toJSON();
						await sqliteDb
							.update(drizzleTable)
							.set(serializedRow)
							.where(eq(drizzleTable.id, row.id));
					},
					catch: () => Ok(undefined),
				});

				if (error) {
					await logger.log(
						IndexError({
							message: `SQLite index onUpdate failed for ${tableName}/${row.id}`,
							context: { tableName, id: row.id, data: row },
							cause: error,
						}),
					);
				}
			},
			onDelete: async (id) => {
				// Skip if this YJS change was triggered by a SQLite change we're processing
				// (prevents SQLite -> YJS -> SQLite infinite loop during pull)
				if (syncCoordination.isProcessingSQLiteChange) return;

				const { error } = await tryAsync({
					try: async () => {
						await sqliteDb.delete(drizzleTable).where(eq(drizzleTable.id, id));
					},
					catch: () => Ok(undefined),
				});

				if (error) {
					await logger.log(
						IndexError({
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

		const results = db.tables[tableName].getAll();
		const rows = results.filter((r) => r.status === 'valid').map((r) => r.row);

		for (const row of rows) {
			const { error } = await tryAsync({
				try: async () => {
					const serializedRow = row.toJSON();
					await sqliteDb.insert(drizzleTable).values(serializedRow);
				},
				catch: () => Ok(undefined),
			});

			if (error) {
				await logger.log(
					IndexError({
						message: `Failed to sync row ${row.id} to SQLite during init`,
						context: { rowId: row.id, tableName, cause: error },
					}),
				);
			}
		}
	}

	// Return destroy function alongside exported resources (flattened structure)
	return defineIndexExports({
		destroy() {
			for (const unsub of unsubscribers) {
				unsub();
			}
			// Close the database connection to ensure WAL files are properly checkpointed
			client.close();
		},

		/**
		 * Pull: Sync from YJS to SQLite (replace all SQLite data with current YJS data)
		 */
		pullToSqlite: defineQuery({
			description:
				'Pull all YJS data to SQLite (deletes existing rows and writes fresh copies)',
			handler: async () => {
				return tryAsync({
					try: async () => {
						syncCoordination.isProcessingYJSChange = true;

						// Delete all rows from all SQLite tables
						for (const tableName of db.getTableNames()) {
							const drizzleTable = drizzleTables[tableName];
							if (!drizzleTable) {
								throw new Error(`Drizzle table for "${tableName}" not found`);
							}
							await sqliteDb.delete(drizzleTable);
						}

						// Insert all valid rows from YJS into SQLite
						for (const tableName of db.getTableNames()) {
							const drizzleTable = drizzleTables[tableName];
							if (!drizzleTable) {
								throw new Error(`Drizzle table for "${tableName}" not found`);
							}

							const results = db.tables[tableName].getAll();
							const validRows = results
								.filter((r) => r.status === 'valid')
								.map((r) => r.row);

							for (const row of validRows) {
								const serializedRow = row.toJSON();
								await sqliteDb.insert(drizzleTable).values(serializedRow);
							}
						}

						syncCoordination.isProcessingYJSChange = false;
					},
					catch: (error) => {
						syncCoordination.isProcessingYJSChange = false;
						return IndexErr({
							message: `SQLite index push failed: ${extractErrorMessage(error)}`,
							context: { operation: 'push' },
						});
					},
				});
			},
		}),

		/**
		 * Push: Sync from SQLite to YJS (replace all YJS data with current SQLite data)
		 */
		pushFromSqlite: defineQuery({
			description:
				'Push all SQLite data into YJS (clears YJS tables and imports from database)',
			handler: async () => {
				return tryAsync({
					try: async () => {
						syncCoordination.isProcessingSQLiteChange = true;

						// Clear all YJS tables
						db.transact(() => {
							for (const tableName of db.getTableNames()) {
								db.tables[tableName].clear();
							}
						});

						// Read all rows from SQLite and insert into YJS
						for (const tableName of db.getTableNames()) {
							const drizzleTable = drizzleTables[tableName];
							if (!drizzleTable) {
								throw new Error(`Drizzle table for "${tableName}" not found`);
							}

							const rows = await sqliteDb.select().from(drizzleTable);

							for (const row of rows) {
								const result = db.tables[tableName].insert(row);
								if (result.error) {
									await logger.log(
										IndexError({
											message: `Failed to insert row ${row.id} from SQLite into YJS table ${tableName}`,
											context: {
												rowId: row.id,
												tableName,
												cause: result.error,
											},
										}),
									);
								}
							}
						}

						syncCoordination.isProcessingSQLiteChange = false;
					},
					catch: (error) => {
						syncCoordination.isProcessingSQLiteChange = false;
						return IndexErr({
							message: `SQLite index pull failed: ${extractErrorMessage(error)}`,
							context: { operation: 'pull' },
						});
					},
				});
			},
		}),

		db: sqliteDb,
		...drizzleTables,
	});
}) satisfies Index;

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
