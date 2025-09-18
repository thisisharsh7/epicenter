import type {
	SQLiteColumn,
	SQLiteColumnBuilderBase,
	SQLiteTable,
} from 'drizzle-orm/sqlite-core';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type { Id } from '../core/columns';

/**
 * Helper type to check if a table has at least one ID column
 */
type HasIdColumn<TColumns extends Record<string, SQLiteColumnBuilderBase>> = {
	[K in keyof TColumns]: TColumns[K]['_']['data'] extends Id ? true : never;
}[keyof TColumns] extends never
	? false
	: true;

/**
 * Helper type to ensure all tables have at least one ID column
 */
type TablesWithId<
	TTables extends Record<string, Record<string, SQLiteColumnBuilderBase>>,
> = {
	[K in keyof TTables]: HasIdColumn<TTables[K]> extends true
		? TTables[K]
		: never;
} extends Record<string, Record<string, SQLiteColumnBuilderBase>>
	? TTables
	: never;

/**
 * Write result for operations that modify both markdown and SQLite
 */
export type WriteResult<T> = {
	data: T;
	status: {
		markdown: { success: boolean; error?: Error };
		sqlite: { success: boolean; error?: Error };
	};
};

/**
 * Parse error types for markdown validation
 */
export type ParseError =
	| { type: 'syntax'; file: string; error: Error }
	| { type: 'validation'; file: string; parsed: unknown; errors: string[] };

/**
 * Sync result for rebuilding SQLite from markdown
 */
export type SyncResult = {
	processed: number;
	succeeded: number;
	failed: ParseError[];
};

/**
 * Base table context with built-in methods
 */
export type TableContext<T extends SQLiteTable> = {
	// Reading (SQLite - fast)
	get(id: string): Promise<InferSelectModel<T> | null>;
	get(ids: string[]): Promise<InferSelectModel<T>[]>;
	getAll(): Promise<InferSelectModel<T>[]>;
	count(): Promise<number>;

	// The magic method - returns Drizzle query builder
	select(): any; // Will be properly typed in implementation

	// Reading (Markdown - validation)
	getFromDisk(id: string): Promise<{
		valid?: InferSelectModel<T>;
		invalid?: ParseError;
	}>;
	getAllFromDisk(): Promise<{
		valid: InferSelectModel<T>[];
		invalid: ParseError[];
	}>;

	// Writing (Always both layers)
	create(
		data: InferInsertModel<T> & { id: string },
	): Promise<WriteResult<InferSelectModel<T>>>;
	create(
		data: (InferInsertModel<T> & { id: string })[],
	): Promise<WriteResult<InferSelectModel<T>[]>>;

	update(
		data: Partial<InferInsertModel<T>> & { id: string },
	): Promise<WriteResult<InferSelectModel<T>>>;
	update(
		data: (Partial<InferInsertModel<T>> & { id: string })[],
	): Promise<WriteResult<InferSelectModel<T>[]>>;

	delete(id: string): Promise<WriteResult<null>>;
	delete(ids: string[]): Promise<WriteResult<null>>;

	upsert(
		data: InferInsertModel<T> & { id: string },
	): Promise<WriteResult<InferSelectModel<T>>>;
	upsert(
		data: (InferInsertModel<T> & { id: string })[],
	): Promise<WriteResult<InferSelectModel<T>[]>>;

	// Maintenance
	sync(): Promise<SyncResult>;
};

/**
 * Vault context passed to plugin methods
 */
export type VaultContext<
	TTables extends Record<string, SQLiteTable>,
	TPlugins extends Record<string, any> = {},
> = {
	[K in keyof TTables]: TableContext<TTables[K]>;
} & {
	plugins: TPlugins;
};

/**
 * Base plugin type for dependencies
 */
export type AnyPlugin = {
	id: string;
	dependencies?: readonly AnyPlugin[];
	tables: TablesWithId<Record<string, Record<string, SQLiteColumnBuilderBase>>>;
	methods: (vault: any) => Record<string, any>;
	hooks?: {
		beforeInit?: () => Promise<void>;
		afterInit?: () => Promise<void>;
	};
};

/**
 * Plugin definition
 */
export type Plugin<
	TId extends string = string,
	TTables extends TablesWithId<
		Record<string, Record<string, SQLiteColumnBuilderBase>>
	> = TablesWithId<Record<string, Record<string, SQLiteColumnBuilderBase>>>,
	TMethods extends Record<string, any> = {},
	TDeps extends readonly AnyPlugin[] = readonly [],
> = {
	id: TId;
	dependencies?: TDeps;
	tables: TTables;
	methods: (
		vault: VaultContext<
			ExtractDrizzleTables<TTables>,
			ExtractPluginMethods<TDeps>
		>,
	) => TMethods;
	hooks?: {
		beforeInit?: () => Promise<void>;
		afterInit?: () => Promise<void>;
	};
};

/**
 * Helper type to convert column builders to SQLite tables
 */
type ExtractDrizzleTables<
	TTables extends Record<string, Record<string, SQLiteColumnBuilderBase>>,
> = {
	[K in keyof TTables]: SQLiteTable;
};

/**
 * Helper type to extract methods from plugin dependencies
 */
type ExtractPluginMethods<TDeps extends readonly AnyPlugin[]> = {
	[K in TDeps[number]['id']]: TDeps[number] extends { id: K }
		? ReturnType<TDeps[number]['methods']>
		: never;
};
