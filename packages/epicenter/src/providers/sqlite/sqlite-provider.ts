import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Database } from '@tursodatabase/database/compat';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { extractErrorMessage } from 'wellcrafted/error';
import { tryAsync } from 'wellcrafted/result';
import { defineQuery } from '../../core/actions';
import { IndexErr, IndexError } from '../../core/errors';
import {
	defineProviderExports,
	type Provider,
	type ProviderContext,
} from '../../core/provider';
import type { WorkspaceSchema } from '../../core/schema';
import { convertWorkspaceSchemaToDrizzle } from '../../core/schema/converters/drizzle';
import { createIndexLogger } from '../error-logger';

const DEFAULT_DEBOUNCE_MS = 100;

/**
 * Options for SQLite provider
 */
type SqliteProviderOptions = {
	/**
	 * Debounce interval in milliseconds
	 *
	 * Changes are batched and synced after this delay. When the debounce fires,
	 * SQLite is rebuilt from YJS (all rows deleted, then re-inserted).
	 *
	 * Lower values = more responsive but more SQLite writes.
	 * Higher values = better batching but longer staleness.
	 *
	 * @default 100
	 */
	debounceMs?: number;
};

/**
 * Create a SQLite provider
 * Syncs YJS changes to a SQLite database and exposes Drizzle query interface.
 *
 * This provider creates internal resources (sqliteDb, drizzleTables) and exports them
 * via defineProviderExports(). All exported resources become available in your workspace exports
 * via the `providers` parameter.
 *
 * **Storage**:
 * - Database: `.epicenter/{workspaceId}.db`
 * - Logs: `.epicenter/{workspaceId}/{providerId}.log`
 *
 * **Sync Strategy**:
 * Changes are debounced (default 100ms), then SQLite is rebuilt from YJS.
 * This "rebuild on change" approach is simple and guarantees consistency:
 * - No race conditions from interleaved async operations
 * - No ordering bugs when multiple transactions touch the same row
 * - SQLite always matches YJS exactly after sync
 *
 * The rebuild is fast enough for most use cases (<50k items). For very large
 * datasets, consider splitting into multiple workspaces.
 *
 * @param context - Provider context with workspace ID, tables instance, and storage directory
 * @param options - Optional configuration for sync behavior
 *
 * @example
 * ```typescript
 * // In workspace definition:
 * providers: {
 *   sqlite: (c) => sqliteProvider(c),  // Auto-saves to .epicenter/{id}.db
 *   // Or with custom debounce:
 *   sqlite: (c) => sqliteProvider(c, { debounceMs: 50 }),
 * },
 *
 * exports: ({ providers }) => ({
 *   // Access exported resources from the provider
 *   getPost: defineQuery({
 *     handler: async ({ id }) => {
 *       // providers.sqlite.db is the exported Drizzle database instance
 *       // providers.sqlite.posts is the exported Drizzle table
 *       return await providers.sqlite.db
 *         .select()
 *         .from(providers.sqlite.posts)
 *         .where(eq(providers.sqlite.posts.id, id));
 *     }
 *   })
 * })
 * ```
 */
export const sqliteProvider = (async <TSchema extends WorkspaceSchema>(
	{ id, schema, tables, paths }: ProviderContext<TSchema>,
	options: SqliteProviderOptions = {},
) => {
	const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
	if (!paths) {
		throw new Error(
			'SQLite provider requires Node.js environment with filesystem access',
		);
	}

	const drizzleTables = convertWorkspaceSchemaToDrizzle(schema);

	// Storage: .epicenter/providers/sqlite/{workspaceId}.db
	const databasePath = path.join(paths.provider, `${id}.db`);
	await mkdir(paths.provider, { recursive: true });

	// WAL mode for better concurrent access
	const client = new Database(databasePath);
	client.exec('PRAGMA journal_mode = WAL');
	const sqliteDb = drizzle({ client, schema: drizzleTables });

	// Logs: .epicenter/providers/sqlite/logs/{workspaceId}.log
	const logsDir = path.join(paths.provider, 'logs');
	await mkdir(logsDir, { recursive: true });
	const logPath = path.join(logsDir, `${id}.log`);
	const logger = createIndexLogger({ logPath });

	// Prevents infinite loop during pushFromSqlite: when we insert into YJS,
	// observers fire and would schedule a sync back to SQLite without this flag
	let isPushingFromSqlite = false;

	// =========================================================================
	// SQLite helpers (use sqliteDb and drizzleTables from closure)
	// =========================================================================

	/**
	 * Drop and recreate all SQLite tables.
	 *
	 * Always drops existing tables before recreating to handle schema changes
	 * (e.g., column renames, type changes). This is safe because SQLite is just
	 * an index; YJS is the source of truth and data is re-synced after recreation.
	 *
	 * Uses Drizzle's getTableConfig API for schema introspection.
	 */
	async function recreateTables() {
		for (const drizzleTable of Object.values(drizzleTables)) {
			const tableConfig = getTableConfig(drizzleTable);

			// Drop existing table to handle schema changes
			await sqliteDb.run(sql.raw(`DROP TABLE IF EXISTS "${tableConfig.name}"`));

			// Build column definitions
			const columnDefs: string[] = [];
			for (const column of tableConfig.columns) {
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

				// Quote column names to handle SQLite reserved keywords (e.g., "from", "to", "order")
				columnDefs.push(`"${column.name}" ${sqlType}${constraints}`);
			}

			// Create table with current schema
			const createTableSQL = `CREATE TABLE "${tableConfig.name}" (${columnDefs.join(', ')})`;
			await sqliteDb.run(sql.raw(createTableSQL));
		}
	}

	/**
	 * Rebuild SQLite from YJS data.
	 * Drops/recreates tables then inserts all rows from YJS.
	 */
	async function rebuildSqlite() {
		// Drop and recreate tables (benchmarks show this is faster than DELETE at scale)
		await recreateTables();

		// Insert all valid rows from YJS into SQLite
		for (const table of tables.$tables()) {
			const drizzleTable = drizzleTables[table.name];
			if (!drizzleTable) {
				throw new Error(`Drizzle table for "${table.name}" not found`);
			}

			const rows = table.getAllValid();

			if (rows.length > 0) {
				const { error } = await tryAsync({
					try: async () => {
						const serializedRows = rows.map((row) => row.toJSON());
						// @ts-expect-error SerializedRow<TSchema[string]>[] is not assignable to InferInsertModel<DrizzleTable>[] due to union type from $tables() iteration
						await sqliteDb.insert(drizzleTable).values(serializedRows);
					},
					catch: (e) =>
						IndexErr({
							message: `Failed to sync ${rows.length} rows to table "${table.name}" in SQLite: ${extractErrorMessage(e)}`,
						}),
				});

				if (error) {
					logger.log(error);
				}
			}
		}
	}

	// =========================================================================
	// Debounce state
	// =========================================================================
	let syncTimeout: NodeJS.Timeout | null = null;

	function scheduleSync() {
		if (syncTimeout) clearTimeout(syncTimeout);
		syncTimeout = setTimeout(async () => {
			syncTimeout = null;
			await rebuildSqlite();
		}, debounceMs);
	}

	// =========================================================================
	// Set up observers for each table
	// =========================================================================
	const unsubscribers: Array<() => void> = [];

	for (const table of tables.$tables()) {
		const drizzleTable = drizzleTables[table.name];
		if (!drizzleTable) {
			throw new Error(`Drizzle table for "${table.name}" not found`);
		}

		const unsub = table.observe({
			onAdd: (result) => {
				if (isPushingFromSqlite) return;
				if (result.error) {
					logger.log(
						IndexError({
							message: `SQLite index onAdd: validation failed for ${table.name}`,
						}),
					);
					return;
				}
				scheduleSync();
			},
			onUpdate: (result) => {
				if (isPushingFromSqlite) return;
				if (result.error) {
					logger.log(
						IndexError({
							message: `SQLite index onUpdate: validation failed for ${table.name}`,
						}),
					);
					return;
				}
				scheduleSync();
			},
			onDelete: () => {
				if (isPushingFromSqlite) return;
				scheduleSync();
			},
		});
		unsubscribers.push(unsub);
	}

	// =========================================================================
	// Initial sync: YJS → SQLite (blocking to ensure tables exist before queries)
	// =========================================================================
	await recreateTables();

	// Insert all valid rows from YJS into SQLite
	for (const table of tables.$tables()) {
		const drizzleTable = drizzleTables[table.name];
		if (!drizzleTable) {
			throw new Error(`Drizzle table for "${table.name}" not found`);
		}

		const rows = table.getAllValid();

		if (rows.length > 0) {
			const { error } = await tryAsync({
				try: async () => {
					const serializedRows = rows.map((row) => row.toJSON());
					// @ts-expect-error SerializedRow<TSchema[string]>[] is not assignable to InferInsertModel<DrizzleTable>[] due to union type from $tables() iteration
					await sqliteDb.insert(drizzleTable).values(serializedRows);
				},
				catch: (e) =>
					IndexErr({
						message: `Failed to sync ${rows.length} rows to table "${table.name}" in SQLite during init: ${extractErrorMessage(e)}`,
					}),
			});

			if (error) {
				logger.log(error);
			}
		}
	}

	// Return destroy function alongside exported resources (flattened structure)
	return defineProviderExports({
		async destroy() {
			// Clear any pending sync timeout
			if (syncTimeout) {
				clearTimeout(syncTimeout);
				syncTimeout = null;
			}

			for (const unsub of unsubscribers) {
				unsub();
			}
			// Flush and close logger to ensure all pending logs are written
			await logger.close();
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
					try: () => rebuildSqlite(),
					catch: (error) =>
						IndexErr({
							message: `SQLite provider pull operation failed: ${extractErrorMessage(error)}`,
						}),
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
						isPushingFromSqlite = true;
						tables.$clearAll();

						for (const table of tables.$tables()) {
							const drizzleTable = drizzleTables[table.name];
							if (!drizzleTable) {
								throw new Error(`Drizzle table for "${table.name}" not found`);
							}

							const rows = await sqliteDb.select().from(drizzleTable);
							for (const row of rows) {
								// @ts-expect-error InferSelectModel<DrizzleTable> is not assignable to InferInsertModel<TableHelper<TSchema[string]>> due to union type from $tables() iteration
								table.upsert(row);
							}
						}

						isPushingFromSqlite = false;
					},
					catch: (error) => {
						isPushingFromSqlite = false;
						return IndexErr({
							message: `SQLite provider push operation failed: ${extractErrorMessage(error)}`,
						});
					},
				});
			},
		}),

		db: sqliteDb,
		...drizzleTables,
	});
}) satisfies Provider;
