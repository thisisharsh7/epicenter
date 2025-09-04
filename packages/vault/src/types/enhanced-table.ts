import type {
	SQLiteTable,
	SQLiteSelectQueryBuilder,
} from 'drizzle-orm/sqlite-core';
import type {
	InferInsertModel,
	InferSelectModel,
} from 'drizzle-orm';

/**
 * Enhanced table methods that will be added to each SQLite table
 */
export type EnhancedTableMethods<T extends SQLiteTable> = {
	/**
	 * Create a new record - writes to both markdown and SQLite
	 */
	create(data: InferInsertModel<T>): Promise<InferSelectModel<T>>;

	/**
	 * Find a record by ID - reads from SQLite for performance
	 */
	findById(id: any): Promise<InferSelectModel<T> | null>;

	/**
	 * Update a record by ID - updates both markdown and SQLite
	 */
	update(
		id: any,
		data: Partial<InferInsertModel<T>>,
	): Promise<InferSelectModel<T> | null>;

	/**
	 * Delete a record by ID - removes from both markdown and SQLite
	 */
	delete(id: any): Promise<boolean>;

	/**
	 * Convenience method for querying - returns db.select().from(this)
	 */
	select(): any; // Simplified type for now to avoid complex Drizzle type issues
};

/**
 * Enhanced table type - intersection of SQLite table + our custom methods
 * This maintains full Drizzle compatibility while adding CRUD methods
 */
export type EnhancedTable<T extends SQLiteTable> = T & EnhancedTableMethods<T>;