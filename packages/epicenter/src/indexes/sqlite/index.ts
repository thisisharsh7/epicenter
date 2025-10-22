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
import * as Y from 'yjs';
import { IndexErr } from '../../core/errors';
import { defineIndex } from '../../core/indexes';
import type { DateWithTimezone, Row, WorkspaceSchema } from '../../core/schema';
import type { Db } from '../../db/core';
import { DateWithTimezoneSerializer } from './builders';
import {
	convertWorkspaceSchemaToDrizzle
} from './schema-converter';

/**
 * Database filename for SQLite.
 *
 * Must be one of:
 * - ':memory:' - For in-memory database
 * - A filename ending in '.db' that follows these rules:
 *   - Cannot start with '.' (no hidden files)
 *   - Cannot start with '/' (no absolute paths - use filename only)
 *   - Cannot contain path separators (no folders - filename only)
 *   - Can only contain: a-z, A-Z, 0-9, _ (underscore), - (hyphen), . (period)
 *
 * Note: All database files are automatically stored in the .data directory.
 * The .data directory is created automatically if it doesn't exist.
 *
 * Valid examples:
 * - ':memory:'
 * - 'app.db'
 * - 'my_database.db'
 * - 'test-data.db'
 * - 'cache.v2.db'
 *
 * Invalid examples:
 * - '.hidden.db' (starts with '.')
 * - '/path/to/db.db' (contains path separator)
 * - '.data/pages.db' (contains path separator)
 * - 'database' (missing '.db' extension)
 * - 'my@db.db' (contains invalid character '@')
 */
type DatabaseFilename = ':memory:' | `${string}.db`;

/**
 * SQLite index configuration
 */
export type SQLiteIndexConfig = {
	/**
	 * Database filename for SQLite.
	 *
	 * Defaults to ':memory:' for in-memory database.
	 * Use a filename ending in '.db' for persistent storage in the .data directory.
	 * The .data directory is created automatically if it doesn't exist.
	 *
	 * Examples:
	 * - ':memory:' - In-memory database
	 * - 'pages.db' - Stored at .data/pages.db
	 * - 'content-hub.db' - Stored at .data/content-hub.db
	 *
	 * @see DatabaseFilename for validation rules and examples
	 * @default ':memory:'
	 */
	database?: DatabaseFilename;
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
 * Syncs YJS changes to a SQLite database and exposes Drizzle query interface
 *
 * This index creates internal resources (sqliteDb, drizzleTables) and exports them
 * via defineIndex(). All exported resources become available in your workspace actions
 * via the `indexes` parameter.
 *
 * @param db - Epicenter database instance (for type inference only)
 * @param config - SQLite configuration options
 *
 * @example
 * ```typescript
 * // In workspace definition:
 * indexes: async ({ db }) => ({
 *   sqlite: await sqliteIndex(db, { database: 'app.db' }),
 * }),
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
export async function sqliteIndex<TWorkspaceSchema extends WorkspaceSchema>(
	db: Db<TWorkspaceSchema>,
	{ database = ':memory:' }: SQLiteIndexConfig = {},
) {
	// Convert table schemas to Drizzle tables
	const drizzleTables = convertWorkspaceSchemaToDrizzle(db.schema);

	// Resolve database path: join with .data directory if not :memory:
	let resolvedDatabasePath = database;
	if (database !== ':memory:') {
		// Create .data directory if it doesn't exist
		await mkdir('.data', { recursive: true });
		// Join filename with .data directory
		resolvedDatabasePath = join('.data', database) as DatabaseFilename;
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
