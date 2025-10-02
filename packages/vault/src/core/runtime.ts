import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Result } from 'wellcrafted/result';
import { tryAsync } from 'wellcrafted/result';
import type { TableSchema } from './column-schemas';
import { VaultOperationErr, type VaultOperationError } from './errors';
import type { RowData } from './indexes';
import type { PluginMethod } from './methods';
import type { Plugin } from './plugin';
import { createYjsDocument } from './yjsdoc';

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
	const doc = createYjsDocument(plugin.id, plugin.tables);

	// 2. Initialize indexes
	const indexContext = {
		ydoc: doc.ydoc,
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
		doc.observeTable(tableName, {
			onAdd: async (id, data) => {
				for (const index of Object.values(indexes)) {
					const result = await index.onAdd(tableName, id, data);
					if (result.error) {
						console.error(
							`Index onAdd failed for ${tableName}/${id}:`,
							result.error,
						);
					}
				}
			},
			onUpdate: async (id, data) => {
				for (const index of Object.values(indexes)) {
					const result = await index.onUpdate(tableName, id, data);
					if (result.error) {
						console.error(
							`Index onUpdate failed for ${tableName}/${id}:`,
							result.error,
						);
					}
				}
			},
			onDelete: async (id) => {
				for (const index of Object.values(indexes)) {
					const result = await index.onDelete(tableName, id);
					if (result.error) {
						console.error(
							`Index onDelete failed for ${tableName}/${id}:`,
							result.error,
						);
					}
				}
			},
		});
	}

	// 4. Create table helpers (write-only to YJS)
	const tables = createTableHelpers(doc, plugin.tables);

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
		ydoc: doc.ydoc,
	};

	return workspaceInstance as T;
}

/**
 * Table helpers that write to YJS
 * Reads should go through indexes (e.g., indexes.sqlite.posts.select())
 */
type TableHelper = {
	upsert(data: RowData): Promise<Result<RowData, VaultOperationError>>;
	deleteById(id: string): Promise<Result<boolean, VaultOperationError>>;
	deleteByIds(ids: string[]): Promise<Result<number, VaultOperationError>>;
};

/**
 * Create table helpers for all tables
 * These helpers write to YJS, which triggers index updates
 */
function createTableHelpers(
	doc: ReturnType<typeof createYjsDocument>,
	tableSchemas: Record<string, TableSchema>,
): Record<string, TableHelper> {
	const helpers: Record<string, TableHelper> = {};

	for (const [tableName] of Object.entries(tableSchemas)) {
		helpers[tableName] = {
			async upsert(
				data: RowData,
			): Promise<Result<RowData, VaultOperationError>> {
				return tryAsync({
					try: async () => {
						const rowsById = doc.getTableRowsById(tableName);
						const rowOrder = doc.getTableRowOrder(tableName);

						// Convert plain data to Y.Map
						const ymap = doc.convertPlainToYMap(tableName, data);

						// Update in transaction
						doc.ydoc.transact(() => {
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
						const rowsById = doc.getTableRowsById(tableName);
						const rowOrder = doc.getTableRowOrder(tableName);

						const exists = rowsById.has(id);
						if (!exists) return false;

						doc.ydoc.transact(() => {
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
						const rowsById = doc.getTableRowsById(tableName);
						const rowOrder = doc.getTableRowOrder(tableName);

						let count = 0;

						doc.ydoc.transact(() => {
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
