import { createClient } from '@libsql/client';
import type {
	InferInsertModel,
	InferSelectModel,
	SelectedFields,
} from 'drizzle-orm';
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
	PluginAPI,
} from '../types/drizzle-helpers';
import { VaultOperationErr, type VaultOperationError } from './errors';
import type { PluginMethod, PluginMethodMap } from './methods';
import type { Plugin, TableHelpers } from './plugin';

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

	// If this is an aggregator plugin with no methods,
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

	// Build plugin context for this plugin
	const context = {
		plugins: dependencies,
		tables: tables,
	};

	// Initialize plugin methods
	const rawMethods = plugin.methods(context);

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
 * Process plugin methods to make them directly callable
 */
function processPluginMethods(methods: PluginMethodMap): PluginMethodMap {
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
 * Wrap a plugin method to make it directly callable
 * The function validates input, executes the handler, and returns the Result
 */
function makeMethodDirectlyCallable<
	TSchema extends StandardSchemaV1 = StandardSchemaV1,
	TOutput = unknown,
>(
	method: PluginMethod<TSchema, TOutput>,
): PluginMethod<TSchema, TOutput> &
	((
		input: StandardSchemaV1.InferOutput<TSchema>,
	) => Result<TOutput, VaultOperationError> | Promise<Result<TOutput, VaultOperationError>>) {
	// Create a callable function that validates and executes
	const callableMethod = async (input: StandardSchemaV1.InferOutput<TSchema>) => {
		// Validate input using the schema
		const validationResult = method.input['~standard'].validate(input);
		if (validationResult instanceof Promise) {
			throw new TypeError('Schema validation must be synchronous');
		}
		if (validationResult.issues) {
			throw new Error(
				`Validation failed: ${validationResult.issues.map((i) => i.message).join(', ')}`,
			);
		}
		const validatedInput =
			validationResult.value as StandardSchemaV1.InferOutput<TSchema>;

		// Execute handler and return the Result directly
		return await method.handler(validatedInput);
	};

	// Attach the method properties to the function for introspection if needed
	return Object.assign(callableMethod, method);
}

/**
 * Create table helpers for a given table
 */
function createTableHelpers<T extends TableWithId>(
	db: LibSQLDatabase,
	storage: RuntimeContext['storage'],
	table: T,
	tableName: string,
): TableHelpers<T> & T {
	const helpers: TableHelpers<T> = {
		async getById(
			id: string,
		): Promise<Result<InferSelectModel<T> | null, VaultOperationError>> {
			return tryAsync({
				try: async () => {
					const [record] = await db
						.select()
						.from(table)
						.where(eq(table.id, id))
						.limit(1);

					return record ?? null;
				},
				catch: (error) =>
					VaultOperationErr({
						message: `Failed to get record from table ${tableName}`,
						context: { tableName, id },
						cause: error,
					}),
			});
		},

		async getByIds(
			ids: string[],
		): Promise<Result<InferSelectModel<T>[], VaultOperationError>> {
			return tryAsync({
				try: async () => {
					return db.select().from(table).where(inArray(table.id, ids)).all();
				},
				catch: (error) =>
					VaultOperationErr({
						message: `Failed to get records from table ${tableName}`,
						context: { tableName, ids },
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

		async upsert(
			data: InferInsertModel<T> & { id: string },
		): Promise<Result<InferSelectModel<T>, VaultOperationError>> {
			return tryAsync({
				try: async () => {
					// Try update first, then insert if not found
					const existing = await this.getById(data.id);

					if (existing.data) {
						// Update existing record
						const [updated] = await db
							.update(table)
							.set(data)
							.where(eq(table.id, data.id))
							.returning();

						if (updated && storage.path) {
							try {
								await storage.update(tableName, data.id, updated);
							} catch (error) {
								console.warn(
									`Warning updating storage for ${tableName}/${data.id}:`,
									error,
								);
							}
						}

						return updated;
					}
					// Create new record
					if (storage.path) {
						try {
							await storage.write(tableName, data.id, data);
						} catch (error) {
							console.warn(
								`Warning writing to storage for ${tableName}/${data.id}:`,
								error,
							);
						}
					}

					const [inserted] = await db.insert(table).values(data).returning();

					return inserted;
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
					// Try to delete from storage first if configured
					if (storage.path) {
						try {
							await storage.delete(tableName, id);
						} catch (error) {
							console.warn(
								`Warning deleting from storage ${tableName}/${id}:`,
								error,
							);
						}
					}

					const result = await db.delete(table).where(eq(table.id, id));

					return result.rowsAffected > 0;
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

					const result = await db.delete(table).where(inArray(table.id, ids));

					return result.rowsAffected;
				},
				catch: (error) =>
					VaultOperationErr({
						message: `Failed to delete records from table ${tableName}`,
						context: { tableName, ids },
						cause: error,
					}),
			});
		},

		select(fields?: any) {
			return fields ? db.select(fields).from(table) : db.select().from(table);
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
