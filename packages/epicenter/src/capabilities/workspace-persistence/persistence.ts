import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Database } from '@tursodatabase/database/compat';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { extractErrorMessage } from 'wellcrafted/error';
import { tryAsync } from 'wellcrafted/result';
import * as Y from 'yjs';

import type { CapabilityContext } from '../../core/capability';
import {
	getWorkspaceDocMaps,
	readDefinitionFromYDoc,
} from '../../core/docs/workspace-doc';
import { CapabilityErr, CapabilityError } from '../../core/errors';
import type {
	KvDefinitionMap,
	Row,
	TableDefinitionMap,
} from '../../core/schema';
import { convertTableDefinitionsToDrizzle } from '../../core/schema/converters/to-drizzle';
import { createIndexLogger } from '../error-logger';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for the workspace persistence capability.
 */
export type WorkspacePersistenceConfig = {
	/**
	 * Base directory for workspace storage.
	 * Files are stored at `{baseDir}/{workspaceId}/{epoch}/`.
	 */
	baseDir: string;

	/**
	 * The epoch number for this workspace.
	 * Determines the subfolder for all persistence files.
	 */
	epoch: number;

	/**
	 * Debounce interval in milliseconds for SQLite sync.
	 * @default 100
	 */
	sqliteDebounceMs?: number;

	/**
	 * Debounce interval in milliseconds for JSON file writes.
	 * @default 500
	 */
	jsonDebounceMs?: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// File Names
// ─────────────────────────────────────────────────────────────────────────────

const FILE_NAMES = {
	/** Full Y.Doc binary - sync source of truth */
	WORKSPACE_YJS: 'workspace.yjs',
	/** Schema metadata from Y.Map('definition') */
	DEFINITION_JSON: 'definition.json',
	/** Settings values from Y.Map('kv') */
	KV_JSON: 'kv.json',
	/** Table data from Y.Map('tables') */
	TABLES_SQLITE: 'tables.sqlite',
	/** Snapshots directory */
	SNAPSHOTS_DIR: 'snapshots',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Workspace Persistence Capability
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Unified workspace persistence capability.
 *
 * Persists a workspace Y.Doc with four outputs:
 * - `workspace.yjs` - Full Y.Doc binary for sync
 * - `definition.json` - Human-readable schema (git-friendly)
 * - `kv.json` - Human-readable settings
 * - `tables.sqlite` - Queryable table data via Drizzle
 *
 * **Storage Layout:**
 * ```
 * {baseDir}/{workspaceId}/{epoch}/
 * ├── workspace.yjs
 * ├── definition.json
 * ├── kv.json
 * ├── tables.sqlite
 * └── snapshots/
 *     └── {unix-ms}.ysnap
 * ```
 *
 * @param context - Capability context with workspace ID, Y.Doc, and table helpers
 * @param config - Configuration with paths and optional debounce settings
 */
export async function workspacePersistence<
	TTableDefinitionMap extends TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap,
>(
	{
		id,
		ydoc,
		tables,
	}: CapabilityContext<TTableDefinitionMap, TKvDefinitionMap>,
	config: WorkspacePersistenceConfig,
) {
	const {
		baseDir,
		epoch,
		sqliteDebounceMs = 100,
		jsonDebounceMs = 500,
	} = config;

	// Compute paths
	const epochDir = path.join(baseDir, id, epoch.toString());
	const workspaceYjsPath = path.join(epochDir, FILE_NAMES.WORKSPACE_YJS);
	const definitionJsonPath = path.join(epochDir, FILE_NAMES.DEFINITION_JSON);
	const kvJsonPath = path.join(epochDir, FILE_NAMES.KV_JSON);
	const tablesSqlitePath = path.join(epochDir, FILE_NAMES.TABLES_SQLITE);
	const snapshotsDir = path.join(epochDir, FILE_NAMES.SNAPSHOTS_DIR);

	// Ensure directories exist
	await mkdir(epochDir, { recursive: true });
	await mkdir(snapshotsDir, { recursive: true });

	// Get the top-level Y.Maps for definition and kv
	// (tables map is accessed internally by the tables helper)
	const { definition: definitionMap, kv: kvMap } = getWorkspaceDocMaps(ydoc);

	// =========================================================================
	// 1. Y.Doc Binary Persistence (workspace.yjs)
	// =========================================================================

	// Load existing Y.Doc state from disk
	let isNewFile = false;
	try {
		const savedState = await readFile(workspaceYjsPath);
		Y.applyUpdate(ydoc, new Uint8Array(savedState));
		console.log(`[Persistence] Loaded workspace.yjs for ${id}`);
	} catch {
		isNewFile = true;
		console.log(`[Persistence] Creating new workspace.yjs for ${id}`);
	}

	// Save Y.Doc on every update
	const saveYDoc = async () => {
		try {
			const state = Y.encodeStateAsUpdate(ydoc);
			await writeFile(workspaceYjsPath, state);
		} catch (error) {
			console.error(`[Persistence] Failed to save workspace.yjs:`, error);
		}
	};

	// Attach Y.Doc update handler
	ydoc.on('update', saveYDoc);

	// Save initial state if new file
	if (isNewFile) {
		await saveYDoc();
	}

	// =========================================================================
	// 2. Definition JSON Persistence (definition.json)
	// =========================================================================

	let definitionDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	const saveDefinitionJson = async () => {
		try {
			const definition = readDefinitionFromYDoc(definitionMap);
			const json = JSON.stringify(definition, null, '\t');
			await writeFile(definitionJsonPath, json);
			console.log(`[Persistence] Saved definition.json for ${id}`);
		} catch (error) {
			console.error(`[Persistence] Failed to save definition.json:`, error);
		}
	};

	const scheduleDefinitionSave = () => {
		if (definitionDebounceTimer) clearTimeout(definitionDebounceTimer);
		definitionDebounceTimer = setTimeout(async () => {
			definitionDebounceTimer = null;
			await saveDefinitionJson();
		}, jsonDebounceMs);
	};

	// Observe definition map changes
	const definitionObserverHandler = () => {
		scheduleDefinitionSave();
	};
	definitionMap.observeDeep(definitionObserverHandler);

	// Initial save
	await saveDefinitionJson();

	// =========================================================================
	// 3. KV JSON Persistence (kv.json)
	// =========================================================================

	let kvDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	const saveKvJson = async () => {
		try {
			const kvData: Record<string, unknown> = {};
			for (const [key, value] of kvMap.entries()) {
				kvData[key] = value;
			}
			const json = JSON.stringify(kvData, null, '\t');
			await writeFile(kvJsonPath, json);
			console.log(`[Persistence] Saved kv.json for ${id}`);
		} catch (error) {
			console.error(`[Persistence] Failed to save kv.json:`, error);
		}
	};

	const scheduleKvSave = () => {
		if (kvDebounceTimer) clearTimeout(kvDebounceTimer);
		kvDebounceTimer = setTimeout(async () => {
			kvDebounceTimer = null;
			await saveKvJson();
		}, jsonDebounceMs);
	};

	// Observe KV map changes
	const kvObserverHandler = () => {
		scheduleKvSave();
	};
	kvMap.observe(kvObserverHandler);

	// Initial save
	await saveKvJson();

	// =========================================================================
	// 4. SQLite Persistence (tables.sqlite)
	// =========================================================================

	const drizzleTables = convertTableDefinitionsToDrizzle(tables.$definitions);

	const client = new Database(tablesSqlitePath);
	client.exec('PRAGMA journal_mode = WAL');
	const sqliteDb = drizzle({ client, schema: drizzleTables });

	const logger = createIndexLogger({
		logPath: path.join(epochDir, 'sqlite.log'),
	});

	let isPushingFromSqlite = false;
	let sqliteDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	/**
	 * Drop and recreate all SQLite tables.
	 */
	async function recreateSqliteTables() {
		for (const drizzleTable of Object.values(drizzleTables)) {
			const tableConfig = getTableConfig(drizzleTable);

			await sqliteDb.run(sql.raw(`DROP TABLE IF EXISTS "${tableConfig.name}"`));

			const columnDefs: string[] = [];
			for (const column of tableConfig.columns) {
				const sqlType = column.getSQLType();
				let constraints = '';
				if (column.notNull) constraints += ' NOT NULL';
				if (column.primary) constraints += ' PRIMARY KEY';
				if (column.isUnique) constraints += ' UNIQUE';
				columnDefs.push(`"${column.name}" ${sqlType}${constraints}`);
			}

			const createTableSQL = `CREATE TABLE "${tableConfig.name}" (${columnDefs.join(', ')})`;
			await sqliteDb.run(sql.raw(createTableSQL));
		}
	}

	/**
	 * Rebuild SQLite from Y.Doc tables data.
	 */
	async function rebuildSqlite() {
		await recreateSqliteTables();

		for (const { table, paired: drizzleTable } of tables.$zip(drizzleTables)) {
			const rows = table.getAllValid();

			if (rows.length > 0) {
				const { error } = await tryAsync({
					try: async () => {
						// @ts-expect-error Row type incompatibility with Drizzle InferInsertModel
						await sqliteDb.insert(drizzleTable).values(rows);
					},
					catch: (e) =>
						CapabilityErr({
							message: `Failed to sync ${rows.length} rows to "${table.name}": ${extractErrorMessage(e)}`,
						}),
				});

				if (error) {
					logger.log(error);
				}
			}
		}
	}

	const scheduleSqliteSync = () => {
		if (sqliteDebounceTimer) clearTimeout(sqliteDebounceTimer);
		sqliteDebounceTimer = setTimeout(async () => {
			sqliteDebounceTimer = null;
			await rebuildSqlite();
		}, sqliteDebounceMs);
	};

	// Set up table observers for SQLite sync
	const tableUnsubscribers: Array<() => void> = [];

	for (const { table } of tables.$zip(drizzleTables)) {
		const unsub = table.observeChanges((changes) => {
			if (isPushingFromSqlite) return;

			for (const [_id, change] of changes) {
				if (change.action === 'delete') continue;
				if (change.result.status === 'invalid') {
					logger.log(
						CapabilityError({
							message: `SQLite sync: validation failed for ${table.name}`,
						}),
					);
				}
			}

			scheduleSqliteSync();
		});
		tableUnsubscribers.push(unsub);
	}

	// Initial SQLite sync
	await recreateSqliteTables();
	for (const { table, paired: drizzleTable } of tables.$zip(drizzleTables)) {
		const rows = table.getAllValid();
		if (rows.length > 0) {
			const { error } = await tryAsync({
				try: async () => {
					// @ts-expect-error Row type incompatibility with Drizzle InferInsertModel
					await sqliteDb.insert(drizzleTable).values(rows);
				},
				catch: (e) =>
					CapabilityErr({
						message: `Initial sync: ${rows.length} rows to "${table.name}": ${extractErrorMessage(e)}`,
					}),
			});
			if (error) logger.log(error);
		}
	}

	// =========================================================================
	// Exports
	// =========================================================================

	return {
		/** The epoch directory path */
		epochDir,

		/** The snapshots directory path */
		snapshotsDir,

		/** Drizzle database instance for queries */
		db: sqliteDb,

		/** Drizzle table references */
		...drizzleTables,

		/** Force sync Y.Doc to SQLite */
		async pullToSqlite() {
			return tryAsync({
				try: () => rebuildSqlite(),
				catch: (error) =>
					CapabilityErr({
						message: `pullToSqlite failed: ${extractErrorMessage(error)}`,
					}),
			});
		},

		/** Force sync SQLite to Y.Doc */
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
							table.upsert(
								row as Row<
									TTableDefinitionMap[keyof TTableDefinitionMap &
										string]['fields']
								>,
							);
						}
					}

					isPushingFromSqlite = false;
				},
				catch: (error) => {
					isPushingFromSqlite = false;
					return CapabilityErr({
						message: `pushFromSqlite failed: ${extractErrorMessage(error)}`,
					});
				},
			});
		},

		/** Clean up all resources */
		async destroy() {
			// Clear debounce timers
			if (definitionDebounceTimer) {
				clearTimeout(definitionDebounceTimer);
				definitionDebounceTimer = null;
			}
			if (kvDebounceTimer) {
				clearTimeout(kvDebounceTimer);
				kvDebounceTimer = null;
			}
			if (sqliteDebounceTimer) {
				clearTimeout(sqliteDebounceTimer);
				sqliteDebounceTimer = null;
			}

			// Remove Y.Doc observer
			ydoc.off('update', saveYDoc);

			// Remove map observers
			definitionMap.unobserveDeep(definitionObserverHandler);
			kvMap.unobserve(kvObserverHandler);

			// Remove table observers
			for (const unsub of tableUnsubscribers) {
				unsub();
			}

			// Close logger and database
			await logger.close();
			client.close();
		},
	};
}
