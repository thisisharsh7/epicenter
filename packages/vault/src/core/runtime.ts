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
		transact: (fn: () => void, origin?: string) => doc.transact(fn, origin),
	};

	return workspaceInstance as T;
}

/**
 * Table helpers that write to YJS
 * Reads should go through indexes (e.g., indexes.sqlite.posts.select())
 * All operations are synchronous since YJS operations are synchronous
 */
type TableHelper = {
	// Single row operations
	set(data: RowData): void;
	get(id: string): RowData | undefined;
	has(id: string): boolean;
	delete(id: string): boolean;

	// Batch operations (transactional)
	setMany(rows: RowData[]): void;
	getMany(ids: string[]): RowData[];
	deleteMany(ids: string[]): number;

	// Bulk operations
	getAll(): RowData[];
	clear(): void;
	count(): number;
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
			set(data: RowData): void {
				doc.setRow(tableName, data);
			},

			setMany(rows: RowData[]): void {
				doc.setRows(tableName, rows);
			},

			get(id: string): RowData | undefined {
				return doc.getRow(tableName, id);
			},

			getMany(ids: string[]): RowData[] {
				return doc.getRows(tableName, ids);
			},

			getAll(): RowData[] {
				return doc.getAllRows(tableName);
			},

			has(id: string): boolean {
				return doc.hasRow(tableName, id);
			},

			delete(id: string): boolean {
				return doc.deleteRow(tableName, id);
			},

			deleteMany(ids: string[]): number {
				return doc.deleteRows(tableName, ids);
			},

			clear(): void {
				doc.clearTable(tableName);
			},

			count(): number {
				return doc.countRows(tableName);
			},
		};
	}

	return helpers;
}
