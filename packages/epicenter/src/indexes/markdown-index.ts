import { IndexErr } from '../core/errors';
import type { Index } from '../core/indexes';
import {
	deleteMarkdownFile,
	getMarkdownPath,
	writeMarkdownFile,
} from '../storage/markdown-parser';

/**
 * Markdown index configuration
 */
export type MarkdownIndexConfig = {
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
export function createMarkdownIndex(config: MarkdownIndexConfig): Index {
	return (db) => {
		// Set up observers for each table
		const unsubscribers: Array<() => void> = [];

		for (const tableName of db.getTableNames()) {
			const unsub = db.tables[tableName].observe({
				onAdd: async (row) => {
					const filePath = getMarkdownPath(config.storagePath, tableName, row.id);
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
					const filePath = getMarkdownPath(config.storagePath, tableName, row.id);
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
					const filePath = getMarkdownPath(config.storagePath, tableName, id);
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
	};
}
