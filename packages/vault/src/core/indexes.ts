import type { Result } from 'wellcrafted/result';
import type * as Y from 'yjs';
import type { DateWithTimezone, TableSchema } from './column-schemas';
import type { IndexError } from './errors';

/**
 * Index type system for vault.
 * Indexes are synchronized snapshots of YJS data optimized for specific query patterns.
 */

/**
 * A single cell value in a row
 * Represents the runtime value after YJS → plain conversion
 */
export type CellValue =
	| string // id, text, rich-text (as string), select
	| number // integer, real
	| boolean // boolean
	| DateWithTimezone // date with timezone
	| string[] // multi-select
	| null; // nullable fields

/**
 * A row of data with typed cell values
 */
export type RowData = Record<string, CellValue>;

/**
 * Index interface - all indexes must implement these methods
 * Indexes observe YJS changes and keep their own storage in sync
 */
export type Index = {
	/**
	 * Initialize the index (optional)
	 * Called once during runtime initialization
	 * Use this to set up storage, create tables, do initial sync, etc.
	 */
	init?(): Promise<void> | void;

	/**
	 * Destroy/cleanup the index (optional)
	 * Called when the runtime shuts down
	 */
	destroy?(): Promise<void> | void;

	/**
	 * Handle a row being added to a table
	 * Called when observeDeep detects a new row in YJS
	 */
	onAdd(
		tableName: string,
		id: string,
		data: RowData,
	): Result<void, IndexError> | Promise<Result<void, IndexError>>;

	/**
	 * Handle a row being updated in a table
	 * Called when observeDeep detects changes to a row in YJS
	 */
	onUpdate(
		tableName: string,
		id: string,
		data: RowData,
	): Result<void, IndexError> | Promise<Result<void, IndexError>>;

	/**
	 * Handle a row being deleted from a table
	 * Called when observeDeep detects a row deletion in YJS
	 */
	onDelete(
		tableName: string,
		id: string,
	): Result<void, IndexError> | Promise<Result<void, IndexError>>;

	/**
	 * Index-specific query methods and APIs
	 * Each index can expose its own interface for querying
	 * Examples:
	 * - SQLite: select(), db, tables
	 * - Vector: search(), embed()
	 * - Search: search(), reindex()
	 */
	[key: string]: any;
};

/**
 * Context passed to index factory functions
 */
export type IndexContext = {
	/**
	 * The YJS document for this workspace
	 */
	ydoc: Y.Doc;

	/**
	 * Table schemas for all tables in this workspace
	 * Maps table name → column schemas
	 */
	tableSchemas: Record<string, TableSchema>;

	/**
	 * Globally unique workspace ID
	 */
	workspaceId: string;
};

/**
 * Index factory function signature
 * Takes context and returns an Index implementation
 */
export type IndexFactory = (context: IndexContext) => Index;

/**
 * Indexes definition function signature
 * Receives context and returns a map of index instances
 */
export type IndexesDefinition = (context: IndexContext) => Record<string, Index>;
