import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Database } from '@tursodatabase/database/compat';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { extractErrorMessage } from 'wellcrafted/error';
import { tryAsync } from 'wellcrafted/result';

import { CapabilityErr, CapabilityError } from '../../core/errors';
import {
	defineCapabilities,
	type CapabilityContext,
} from '../../core/capability';
import type { Row, TablesSchema } from '../../core/schema';
import { convertWorkspaceSchemaToDrizzle } from '../../core/schema/converters/to-drizzle';
import { createIndexLogger } from '../error-logger';

const DEFAULT_DEBOUNCE_MS = 100;

/**
 * Configuration for the SQLite capability.
 */
export type SqliteConfig = {
	/** Absolute path to the .db file. */
	dbPath: string;
	/** Absolute path to logs directory. */
	logsDir: string;
	/**
	 * Debounce interval in milliseconds.
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
 * SQLite capability: syncs YJS changes to SQLite and exposes Drizzle query interface.
 *
 * This capability creates internal resources (sqliteDb, drizzleTables) and exports them
 * via defineCapabilities(). All exported resources become available in your workspace
 * via `client.capabilities.sqlite`.
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
 * @param context - Capability context with workspace ID and tables instance
 * @param config - Configuration with paths and optional debounce settings
 *
 * @example
 * ```typescript
 * import { join } from 'node:path';
 *
 * const projectDir = '/my/project';
 * const epicenterDir = join(projectDir, '.epicenter');
 *
 * const client = await workspace
 *   .withCapabilities({
 *     sqlite: (ctx) => sqlite(ctx, {
 *       dbPath: join(epicenterDir, 'sqlite', `${ctx.id}.db`),
 *       logsDir: join(epicenterDir, 'sqlite', 'logs'),
 *     }),
 *   })
 *   .create();
 *
 * // Query with Drizzle:
 * const posts = await client.capabilities.sqlite.db
 *   .select()
 *   .from(client.capabilities.sqlite.posts);
 * ```
 */
export const sqlite = async <TTablesSchema extends TablesSchema>(
	{ id, tables }: CapabilityContext<TTablesSchema>,
	config: SqliteConfig,
) => {
	const { dbPath, logsDir, debounceMs = DEFAULT_DEBOUNCE_MS } = config;

	const schema = Object.fromEntries(
		tables.$all().map((t) => [t.name, t.schema]),
	) as unknown as TTablesSchema;
	const drizzleTables = convertWorkspaceSchemaToDrizzle(schema);

	await mkdir(path.dirname(dbPath), { recursive: true });
	await mkdir(logsDir, { recursive: true });

	const client = new Database(dbPath);
	client.exec('PRAGMA journal_mode = WAL');
	const sqliteDb = drizzle({ client, schema: drizzleTables });

	const logger = createIndexLogger({
		logPath: path.join(logsDir, `${id}.log`),
	});

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
		for (const { table, paired: drizzleTable } of tables.$zip(drizzleTables)) {
			const rows = table.getAllValid();

			if (rows.length > 0) {
				const { error } = await tryAsync({
					try: async () => {
						// @ts-expect-error Row<TSchema[keyof TSchema]>[] is not assignable to InferInsertModel<DrizzleTable>[] due to union type limitation
						await sqliteDb.insert(drizzleTable).values(rows);
					},
					catch: (e) =>
						CapabilityErr({
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

	for (const { table } of tables.$zip(drizzleTables)) {
		const unsub = table.observeChanges((changes) => {
			if (isPushingFromSqlite) return;

			for (const [_id, change] of changes) {
				if (change.action === 'delete') continue;
				if (change.result.status === 'invalid') {
					logger.log(
						CapabilityError({
							message: `SQLite capability ${change.action}: validation failed for ${table.name}`,
						}),
					);
				}
			}

			scheduleSync();
		});
		unsubscribers.push(unsub);
	}

	// =========================================================================
	// Initial sync: YJS → SQLite (blocking to ensure tables exist before queries)
	// =========================================================================
	await recreateTables();

	// Insert all valid rows from YJS into SQLite
	for (const { table, paired: drizzleTable } of tables.$zip(drizzleTables)) {
		const rows = table.getAllValid();

		if (rows.length > 0) {
			const { error } = await tryAsync({
				try: async () => {
					// @ts-expect-error Row<TSchema[keyof TSchema]>[] is not assignable to InferInsertModel<DrizzleTable>[] due to union type limitation
					await sqliteDb.insert(drizzleTable).values(rows);
				},
				catch: (e) =>
					CapabilityErr({
						message: `Failed to sync ${rows.length} rows to table "${table.name}" in SQLite during init: ${extractErrorMessage(e)}`,
					}),
			});

			if (error) {
				logger.log(error);
			}
		}
	}

	// Return destroy function alongside exported resources (flattened structure)
	return defineCapabilities({
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

		async pullToSqlite() {
			return tryAsync({
				try: () => rebuildSqlite(),
				catch: (error) =>
					CapabilityErr({
						message: `SQLite capability pull operation failed: ${extractErrorMessage(error)}`,
					}),
			});
		},

		async pushFromSqlite() {
			return tryAsync({
				try: async () => {
					isPushingFromSqlite = true;
					tables.clearAll();

					for (const { table, paired: drizzleTable } of tables.$zip(
						drizzleTables,
					)) {
						const rows = await sqliteDb.select().from(drizzleTable);
						for (const row of rows) {
							// Cast is safe: Drizzle schema is derived from workspace schema
							table.upsert(
								row as Row<TTablesSchema[keyof TTablesSchema & string]>,
							);
						}
					}

					isPushingFromSqlite = false;
				},
				catch: (error) => {
					isPushingFromSqlite = false;
					return CapabilityErr({
						message: `SQLite capability push operation failed: ${extractErrorMessage(error)}`,
					});
				},
			});
		},

		db: sqliteDb,
		...drizzleTables,
	});
};
