import type { Schema, TableSchema } from '../core/column-schemas';
import { IndexErr } from '../core/errors';
import { defineIndex, type Index } from '../core/indexes';
import type { Db } from '../db/core';
import {
	deleteMarkdownFile,
	getMarkdownPath,
	writeMarkdownFile,
} from '../storage/markdown-parser';

/**
 * Markdown index configuration
 */
export type MarkdownIndexConfig<TSchema extends Schema = Schema> = {
	/**
	 * Database instance with schema
	 * Required for type inference
	 */
	db: Db<TSchema>;
	/**
	 * Path where markdown files should be stored
	 * Example: './data/markdown'
	 */
	storagePath: string;
};

/**
 * Create a markdown index
 * Syncs YJS changes to markdown files for git-friendly persistence
 * No query interface - just persistence
 */
export function markdownIndex<TSchema extends Schema>({
	db: _db,
	storagePath,
}: MarkdownIndexConfig<TSchema>): Index<TSchema, 'markdown', {}> {
	return defineIndex({
		id: 'markdown',
		init: (db: Db<TSchema>) => {
			// Set up observers for each table
			const unsubscribers: Array<() => void> = [];

			for (const tableName of db.getTableNames()) {
				const table = db.tables[tableName];
				if (!table) {
					throw new Error(`Table "${tableName}" not found`);
				}
				const unsub = table.observe({
					onAdd: async (row) => {
						const filePath = getMarkdownPath(
							storagePath,
							tableName,
							row.id,
						);
						const { error } = await writeMarkdownFile(filePath, row);
						if (error) {
							console.error(
								IndexErr({
									message: `Markdown index onAdd failed for ${tableName}/${row.id}`,
									context: { tableName, id: row.id, filePath },
									cause: error,
								}),
							);
						}
					},
					onUpdate: async (row) => {
						const filePath = getMarkdownPath(
							storagePath,
							tableName,
							row.id,
						);
						const { error } = await writeMarkdownFile(filePath, row);
						if (error) {
							console.error(
								IndexErr({
									message: `Markdown index onUpdate failed for ${tableName}/${row.id}`,
									context: { tableName, id: row.id, filePath },
									cause: error,
								}),
							);
						}
					},
					onDelete: async (id) => {
						const filePath = getMarkdownPath(storagePath, tableName, id);
						const { error } = await deleteMarkdownFile(filePath);
						if (error) {
							console.error(
								IndexErr({
									message: `Markdown index onDelete failed for ${tableName}/${id}`,
									context: { tableName, id, filePath },
									cause: error,
								}),
							);
						}
					},
				});
				unsubscribers.push(unsub);
			}

			return {
				destroy() {
					for (const unsub of unsubscribers) {
						unsub();
					}
				},
				queries: {},
			};
		},
	});
}
