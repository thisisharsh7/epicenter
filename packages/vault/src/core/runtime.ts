import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Result } from 'wellcrafted/result';
import { tryAsync } from 'wellcrafted/result';
import type { TableSchema } from './column-schemas';
import { VaultOperationErr, type VaultOperationError } from './errors';
import type { PluginMethod } from './methods';
import type { Plugin } from './plugin';
import {
	convertPlainToYMap,
	getTableRowOrder,
	getTableRowsById,
	initWorkspaceDoc,
	observeTable,
} from './yjsdoc';

/**
 * Runtime configuration provided by the user
 */
export type RuntimeConfig = {
	/**
	 * YJS persistence options (optional)
	 * If not provided, document lives in memory
	 */
	yjsPersistence?: {
		path?: string;
		// Future: other persistence strategies
	};
};

/**
 * Run a workspace with YJS-first architecture
 * Returns the workspace instance with tables, methods, and indexes
 */
export async function runPlugin<T = unknown>(
	plugin: Plugin,
	config: RuntimeConfig = {},
): Promise<T> {
	// 1. Initialize YJS document
	const ydoc = initWorkspaceDoc(plugin.id, plugin.tables);

	// 2. Initialize indexes
	const indexContext = {
		ydoc,
		tableSchemas: plugin.tables,
		workspaceId: plugin.id,
	};

	const indexes = plugin.indexes(indexContext);

	// Initialize each index
	for (const [indexName, index] of Object.entries(indexes)) {
		try {
			await index.init?.();
		} catch (error) {
			console.error(`Failed to initialize index "${indexName}":`, error);
		}
	}

	// 3. Set up observers for all tables
	for (const tableName of Object.keys(plugin.tables)) {
		observeTable(ydoc, tableName, {
			onAdd: async (id, data) => {
				for (const index of Object.values(indexes)) {
					try {
						await index.onAdd(tableName, id, data);
					} catch (error) {
						console.error(`Index onAdd failed for ${tableName}/${id}:`, error);
					}
				}
			},
			onUpdate: async (id, data) => {
				for (const index of Object.values(indexes)) {
					try {
						await index.onUpdate(tableName, id, data);
					} catch (error) {
						console.error(
							`Index onUpdate failed for ${tableName}/${id}:`,
							error,
						);
					}
				}
			},
			onDelete: async (id) => {
				for (const index of Object.values(indexes)) {
					try {
						await index.onDelete(tableName, id);
					} catch (error) {
						console.error(
							`Index onDelete failed for ${tableName}/${id}:`,
							error,
						);
					}
				}
			},
		});
	}

	// 4. Create table helpers (write-only to YJS)
	const tables = createTableHelpers(ydoc, plugin.tables);

	// 5. Initialize dependencies (if any)
	const dependencies: Record<string, unknown> = {};
	// TODO: Handle dependencies

	// 6. Initialize methods with full context
	const methodContext = {
		plugins: dependencies,
		tables,
		indexes,
	};

	// Process methods to extract handlers and make them directly callable
	const processedMethods = Object.entries(plugin.methods(methodContext)).reduce(
		(acc, [methodName, method]) => {
			acc[methodName] = method.handler;
			return acc;
		},
		{} as Record<
			string,
			PluginMethod<StandardSchemaV1<unknown, unknown>, unknown>['handler']
		>,
	);

	// 7. Return workspace instance
	const workspaceInstance = {
		...tables,
		...processedMethods,
		indexes,
		ydoc,
	};

	return workspaceInstance as T;
}

/**
 * Table helpers that write to YJS
 * Reads should go through indexes (e.g., indexes.sqlite.posts.select())
 */
type TableHelper = {
	upsert(
		data: Record<string, any>,
	): Promise<Result<Record<string, any>, VaultOperationError>>;
	deleteById(id: string): Promise<Result<boolean, VaultOperationError>>;
	deleteByIds(ids: string[]): Promise<Result<number, VaultOperationError>>;
};

/**
 * Create table helpers for all tables
 * These helpers write to YJS, which triggers index updates
 */
function createTableHelpers(
	ydoc: Y.Doc,
	tableSchemas: Record<string, TableSchema>,
): Record<string, TableHelper> {
	const helpers: Record<string, TableHelper> = {};

	for (const [tableName, columnSchemas] of Object.entries(tableSchemas)) {
		helpers[tableName] = {
			async upsert(
				data: Record<string, any>,
			): Promise<Result<Record<string, any>, VaultOperationError>> {
				return tryAsync({
					try: async () => {
						const rowsById = getTableRowsById(ydoc, tableName);
						const rowOrder = getTableRowOrder(ydoc, tableName);

						// Convert plain data to Y.Map
						const ymap = convertPlainToYMap(data, columnSchemas);

						// Update in transaction
						ydoc.transact(() => {
							rowsById.set(data.id, ymap);

							// Add to rowOrder if new
							const orderArray = rowOrder.toArray();
							if (!orderArray.includes(data.id)) {
								rowOrder.push([data.id]);
							}
						});

						return data;
					},
					catch: (error) =>
						VaultOperationErr({
							message: `Failed to upsert record in table ${tableName}`,
							context: { tableName, data },
							cause: error,
						}),
				});
			},

			async deleteById(
				id: string,
			): Promise<Result<boolean, VaultOperationError>> {
				return tryAsync({
					try: async () => {
						const rowsById = getTableRowsById(ydoc, tableName);
						const rowOrder = getTableRowOrder(ydoc, tableName);

						const exists = rowsById.has(id);
						if (!exists) return false;

						ydoc.transact(() => {
							rowsById.delete(id);

							// Remove from rowOrder
							const orderArray = rowOrder.toArray();
							const index = orderArray.indexOf(id);
							if (index !== -1) {
								rowOrder.delete(index, 1);
							}
						});

						return true;
					},
					catch: (error) =>
						VaultOperationErr({
							message: `Failed to delete record from table ${tableName}`,
							context: { tableName, id },
							cause: error,
						}),
				});
			},

			async deleteByIds(
				ids: string[],
			): Promise<Result<number, VaultOperationError>> {
				return tryAsync({
					try: async () => {
						const rowsById = getTableRowsById(ydoc, tableName);
						const rowOrder = getTableRowOrder(ydoc, tableName);

						let count = 0;

						ydoc.transact(() => {
							for (const id of ids) {
								if (rowsById.has(id)) {
									rowsById.delete(id);
									count++;

									// Remove from rowOrder
									const orderArray = rowOrder.toArray();
									const index = orderArray.indexOf(id);
									if (index !== -1) {
										rowOrder.delete(index, 1);
									}
								}
							}
						});

						return count;
					},
					catch: (error) =>
						VaultOperationErr({
							message: `Failed to delete records from table ${tableName}`,
							context: { tableName, ids },
							cause: error,
						}),
				});
			},
		};
	}

	return helpers;
}
