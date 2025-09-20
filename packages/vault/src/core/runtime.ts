import { createClient } from '@libsql/client';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { eq, inArray, sql } from 'drizzle-orm';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import {
	sqliteTable,
	type SQLiteColumnBuilderBase,
	type SQLiteTable,
} from 'drizzle-orm/sqlite-core';
import { tryAsync, type Result } from 'wellcrafted/result';

import type { StandardSchemaV1 } from '@standard-schema/spec';
import {
	deleteMarkdownFile,
	getMarkdownPath,
	updateMarkdownFile,
	writeMarkdownFile,
} from '../storage/markdown-parser';
import type {
	AffectedRowsResult,
	AggregatedPluginNamespace,
	CountResult,
	StorageData,
	StorageOperations,
	TableWithId,
	VaultContext,
} from '../types/drizzle-helpers';
import { VaultOperationErr, type VaultOperationError } from './errors';
import type { PluginMethod } from './method-helpers';
import type { Plugin, TableHelpers } from './plugin';

/**
 * Runtime configuration provided by the CLI
 */
export type RuntimeConfig = {
	databaseUrl?: string;
	storagePath?: string;
};

/**
 * Runtime context provided to plugins
 */
export type RuntimeContext = {
	db: LibSQLDatabase;
	storage: StorageOperations;
};

/**
 * Create table helpers for a given table
 */
function createTableHelpers<T extends SQLiteTable>(
	db: LibSQLDatabase,
	storage: RuntimeContext['storage'],
	table: T,
	tableName: string,
): TableHelpers<T> & T {
	const helpers: TableHelpers<T> = {
		async getById(
			id: string,
		): Promise<Result<InferSelectModel<T> | null, VaultOperationError>> {
			return this.get(id);
		},

		async findById(
			id: string,
		): Promise<Result<InferSelectModel<T> | null, VaultOperationError>> {
			return this.get(id);
		},

		async get(
			idOrIds: string | string[],
		): Promise<
			Result<
				InferSelectModel<T> | null | InferSelectModel<T>[],
				VaultOperationError
			>
		> {
			return tryAsync({
				try: async () => {
					if (Array.isArray(idOrIds)) {
						return db
							.select()
							.from(table)
							.where(inArray((table as TableWithId).id, idOrIds))
							.all();
					}

					const [record] = await db
						.select()
						.from(table)
						.where(eq((table as TableWithId).id, idOrIds))
						.limit(1);

					return record || null;
				},
				catch: (error) =>
					VaultOperationErr({
						message: `Failed to get record(s) from table ${tableName}`,
						context: { tableName, idOrIds },
						cause: error,
					}),
			});
		},

		async getAll(): Promise<
			Result<InferSelectModel<T>[], VaultOperationError>
		> {
			return tryAsync({
				try: async () => {
					return db.select().from(table).all();
				},
				catch: (error) =>
					VaultOperationErr({
						message: `Failed to get all records from table ${tableName}`,
						context: { tableName },
						cause: error,
					}),
			});
		},

		async count(): Promise<Result<number, VaultOperationError>> {
			return tryAsync({
				try: async () => {
					const result = (await db
						.select({ count: sql<number>`count(*)` })
						.from(table)
						.get()) as CountResult | undefined;
					return result?.count || 0;
				},
				catch: (error) =>
					VaultOperationErr({
						message: `Failed to count records in table ${tableName}`,
						context: { tableName },
						cause: error,
					}),
			});
		},

		async create(
			data:
				| (InferInsertModel<T> & { id: string })
				| (InferInsertModel<T> & { id: string })[],
		): Promise<
			Result<InferSelectModel<T> | InferSelectModel<T>[], VaultOperationError>
		> {
			return tryAsync({
				try: async () => {
					const isArray = Array.isArray(data);
					const items = isArray ? data : [data];

					// Try to write to storage first if configured
					if (storage.path) {
						for (const item of items) {
							try {
								await storage.write(tableName, item.id, item);
							} catch (error) {
								console.warn(
									`Warning writing to storage for ${tableName}/${item.id}:`,
									error,
								);
							}
						}
					}

					// Insert into SQLite
					const inserted = await db
						.insert(table)
						.values(items)
						.returning()
						.all();
					return isArray ? inserted : inserted[0];
				},
				catch: (error) =>
					VaultOperationErr({
						message: `Failed to create record(s) in table ${tableName}`,
						context: { tableName, data },
						cause: error,
					}),
			});
		},

		async update(
			id: string,
			data: Partial<InferInsertModel<T>>,
		): Promise<Result<InferSelectModel<T> | null, VaultOperationError>> {
			return tryAsync({
				try: async () => {
					const [updated] = await db
						.update(table)
						.set(data)
						.where(eq((table as TableWithId).id, id))
						.returning();

					if (updated && storage.path) {
						try {
							await storage.update(tableName, id, updated);
						} catch (error) {
							console.warn(
								`Warning updating storage for ${tableName}/${id}:`,
								error,
							);
						}
					}

					return updated || null;
				},
				catch: (error) =>
					VaultOperationErr({
						message: `Failed to update record ${id} in table ${tableName}`,
						context: { tableName, id, data },
						cause: error,
					}),
			});
		},

		async delete(
			idOrIds: string | string[],
		): Promise<Result<boolean, VaultOperationError>> {
			return tryAsync({
				try: async () => {
					const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];

					// Try to delete from storage first if configured
					if (storage.path) {
						for (const id of ids) {
							try {
								await storage.delete(tableName, id);
							} catch (error) {
								console.warn(
									`Warning deleting from storage ${tableName}/${id}:`,
									error,
								);
							}
						}
					}

					const result = (await db
						.delete(table)
						.where(inArray((table as TableWithId).id, ids))
						.run()) as AffectedRowsResult;

					return result.rowsAffected > 0;
				},
				catch: (error) =>
					VaultOperationErr({
						message: `Failed to delete record(s) from table ${tableName}`,
						context: { tableName, idOrIds },
						cause: error,
					}),
			});
		},

		async upsert(
			data: InferInsertModel<T> & { id: string },
		): Promise<Result<InferSelectModel<T>, VaultOperationError>> {
			return tryAsync({
				try: async () => {
					// Try update first, then insert if not found
					const existing = await this.get(data.id);

					if (existing.data) {
						const updated = await this.update(data.id, data);
						if (updated.error) throw updated.error;
						return updated.data!;
					} else {
						const created = await this.create(data);
						if (created.error) throw created.error;
						return created.data;
					}
				},
				catch: (error) =>
					VaultOperationErr({
						message: `Failed to upsert record in table ${tableName}`,
						context: { tableName, data },
						cause: error,
					}),
			});
		},

		select() {
			return db.select().from(table);
		},
	};

	// Use Proxy to merge table columns and helper methods
	return new Proxy(helpers, {
		get(target, prop) {
			// Check helpers first
			if (prop in target) {
				return target[prop as keyof typeof target];
			}
			// Then check table columns
			if (prop in table) {
				return table[prop as keyof typeof table];
			}
			return undefined;
		},
	}) as TableHelpers<T> & T;
}

/**
 * Initialize a plugin with runtime context
 */
async function initializePlugin(
	plugin: Plugin,
	runtime: RuntimeContext,
	pluginInstances: Map<string, unknown>,
): Promise<unknown> {
	// If already initialized, return cached instance
	if (pluginInstances.has(plugin.id)) {
		return pluginInstances.get(plugin.id);
	}

	// Initialize dependencies first
	const dependencies: Record<string, unknown> = {};
	for (const dep of plugin.dependencies || []) {
		dependencies[dep.id] = await initializePlugin(
			dep,
			runtime,
			pluginInstances,
		);
	}

	// Create SQLite tables for this plugin
	const tables: Record<string, TableHelpers<SQLiteTable> & SQLiteTable> = {};
	for (const [tableName, columns] of Object.entries(plugin.tables)) {
		// Create SQLite table
		const drizzleTable = sqliteTable(
			tableName,
			columns as Record<string, SQLiteColumnBuilderBase>,
		);

		// Create table in database if not exists
		await createTableIfNotExists(runtime.db, tableName, columns);

		// Create enhanced table with helpers
		tables[tableName] = createTableHelpers(
			runtime.db,
			runtime.storage,
			drizzleTable,
			tableName,
		);
	}

	// Build vault context for this plugin
	const vault: VaultContext = {
		...dependencies,
		[plugin.id]: tables,
	};

	// Initialize plugin methods
	const rawMethods = plugin.methods(vault);

	// Process methods to add execute wrapper
	const methods = processPluginMethods(rawMethods);

	// Combine tables and methods into plugin namespace
	const pluginInstance = {
		...tables,
		...methods,
	};

	// Cache the instance
	pluginInstances.set(plugin.id, pluginInstance);

	return pluginInstance;
}

/**
 * Create a table in SQLite if it doesn't exist
 */
async function createTableIfNotExists(
	db: LibSQLDatabase,
	tableName: string,
	columns: Record<string, SQLiteColumnBuilderBase>,
): Promise<void> {
	const columnDefs: string[] = [];

	for (const [columnName, column] of Object.entries(columns)) {
		const config = (column as SQLiteColumnBuilderBase & { config: any }).config;
		const columnType = config.columnType;

		let sqlType = 'TEXT';
		if (
			columnType === 'SQLiteInteger' ||
			columnType === 'SQLiteTimestamp' ||
			columnType === 'SQLiteBoolean'
		) {
			sqlType = 'INTEGER';
		} else if (columnType === 'SQLiteReal') {
			sqlType = 'REAL';
		} else if (columnType === 'SQLiteNumeric') {
			sqlType = 'NUMERIC';
		} else if (columnType === 'SQLiteBlob') {
			sqlType = 'BLOB';
		}

		let constraints = '';
		if (config.notNull === true) {
			constraints += ' NOT NULL';
		}
		if (config.primaryKey === true) {
			constraints += ' PRIMARY KEY';
		}
		if (config.isUnique === true) {
			constraints += ' UNIQUE';
		}

		columnDefs.push(`${columnName} ${sqlType}${constraints}`);
	}

	const createTableSQL = `CREATE TABLE IF NOT EXISTS ${tableName} (${columnDefs.join(', ')})`;
	await db.run(sql.raw(createTableSQL));
}

/**
 * Wrap a plugin method to make it directly callable
 * The function validates input and executes the handler
 */
function makeMethodDirectlyCallable<
	TSchema extends StandardSchemaV1 = StandardSchemaV1,
	TOutput = unknown,
>(
	method: PluginMethod<TSchema, TOutput>,
): PluginMethod<TSchema, TOutput> &
	((
		input: StandardSchemaV1.InferOutput<TSchema>,
	) => TOutput | Promise<TOutput>) {
	// Create a callable function that validates and executes
	const callableMethod = (input: StandardSchemaV1.InferOutput<TSchema>) => {
		// Validate input using the schema
		const result = method.input['~standard'].validate(input);
		if (result instanceof Promise) {
			throw new TypeError('Schema validation must be synchronous');
		}
		if (result.issues) {
			throw new Error(
				`Validation failed: ${result.issues.map((i) => i.message).join(', ')}`,
			);
		}
		const validatedInput =
			result.value as StandardSchemaV1.InferOutput<TSchema>;
		return method.handler(validatedInput);
	};

	// Attach the method properties to the function for introspection if needed
	return Object.assign(callableMethod, method);
}

/**
 * Process plugin methods to make them directly callable
 */
function processPluginMethods(
	methods: Record<string, PluginMethod>,
): Record<string, PluginMethod> {
	const processed: Record<string, unknown> = {};

	for (const [key, method] of Object.entries(methods)) {
		// Check if it's a plugin method (has type and handler)
		if (
			method &&
			typeof method === 'object' &&
			'type' in method &&
			'handler' in method
		) {
			processed[key] = makeMethodDirectlyCallable(method);
		} else {
			// Pass through non-method properties
			processed[key] = method;
		}
	}

	return processed;
}

/**
 * Create storage handlers for markdown files
 */
function createStorage(storagePath?: string): RuntimeContext['storage'] {
	return {
		path: storagePath,

		async write(table: string, id: string, data: StorageData) {
			if (!storagePath) return;
			const filePath = getMarkdownPath(storagePath, table, id);
			await writeMarkdownFile(filePath, data);
		},

		async update(table: string, id: string, data: StorageData) {
			if (!storagePath) return;
			const filePath = getMarkdownPath(storagePath, table, id);
			await updateMarkdownFile(filePath, data);
		},

		async delete(table: string, id: string) {
			if (!storagePath) return;
			const filePath = getMarkdownPath(storagePath, table, id);
			await deleteMarkdownFile(filePath);
		},
	};
}

/**
 * Run a plugin with runtime injection
 * Returns the plugin instance directly for single plugins,
 * or an aggregated namespace for aggregator plugins
 */
export async function runPlugin<T = unknown>(
	plugin: Plugin,
	config: RuntimeConfig = {},
): Promise<T> {
	// Create database connection
	const db = drizzle(
		createClient({
			url: config.databaseUrl || ':memory:',
		}),
	);

	// Create storage handlers
	const storage = createStorage(config.storagePath);

	// Create runtime context
	const runtime: RuntimeContext = {
		db,
		storage,
	};

	// Initialize plugin tree
	const pluginInstances = new Map<string, unknown>();
	const rootInstance = await initializePlugin(plugin, runtime, pluginInstances);

	// If this is a vault-style aggregator plugin with no methods,
	// return all dependencies flattened
	if (
		Object.keys(plugin.tables).length === 0 &&
		Object.keys(rootInstance).length === 0
	) {
		// This is an aggregator plugin, return the aggregated namespace
		const aggregated: AggregatedPluginNamespace = {};
		for (const dep of plugin.dependencies || []) {
			aggregated[dep.id] = pluginInstances.get(dep.id);
		}
		return aggregated as T;
	}

	// Single plugin: return the instance directly
	return rootInstance as T;
}
