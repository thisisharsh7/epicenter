import type { Result } from 'wellcrafted/result';
import type { createEpicenterDb } from '../db/core';
import type { Row } from './column-schemas';
import type { IndexError } from './errors';

/**
 * Index type system for vault.
 * Indexes are synchronized snapshots of YJS data optimized for specific query patterns.
 */

/**
 * Index interface - all indexes must implement these methods
 * Indexes observe YJS changes and keep their own storage in sync
 */
export type Index<TId extends string = string, TActions = Record<string, any>> = {
	/**
	 * Unique identifier for this index
	 * Used as the property name when accessing index actions
	 */
	id: TId;

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
		data: Row,
	): Result<void, IndexError> | Promise<Result<void, IndexError>>;

	/**
	 * Handle a row being updated in a table
	 * Called when observeDeep detects changes to a row in YJS
	 */
	onUpdate(
		tableName: string,
		id: string,
		data: Row,
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
	actions: TActions;
};

/**
 * Context passed to index factory functions
 */
export type IndexContext = {
	/**
	 * The Epicenter database object with high-level CRUD methods
	 * Use methods like getAllRows(), getRow(), etc. instead of raw YJS access
	 * Table schemas are available via db.schema
	 * Workspace ID is available via db.ydoc.guid
	 */
	db: ReturnType<typeof createEpicenterDb>;
};
