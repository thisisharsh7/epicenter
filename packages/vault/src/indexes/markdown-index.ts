import type { Index, IndexContext } from '../core/indexes';
import {
	deleteMarkdownFile,
	getMarkdownPath,
	writeMarkdownFile,
} from '../storage/markdown-parser';

/**
 * Markdown index configuration
 */
export type MarkdownIndexConfig = IndexContext & {
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
	return {
		async init() {},

		async onAdd(tableName, id, data) {
			const filePath = getMarkdownPath(config.storagePath, tableName, id);
			const { error } = await writeMarkdownFile(filePath, data);
			if (error) {
				console.error(
					`Markdown index onAdd failed for ${tableName}/${id}:`,
					error,
				);
			}
		},

		async onUpdate(tableName, id, data) {
			const filePath = getMarkdownPath(config.storagePath, tableName, id);
			const { error } = await writeMarkdownFile(filePath, data);
			if (error) {
				console.error(
					`Markdown index onUpdate failed for ${tableName}/${id}:`,
					error,
				);
			}
		},

		async onDelete(tableName, id) {
			const filePath = getMarkdownPath(config.storagePath, tableName, id);
			const { error } = await deleteMarkdownFile(filePath);
			if (error) {
				console.error(
					`Markdown index onDelete failed for ${tableName}/${id}:`,
					error,
				);
			}
		},

		async destroy() {},
	};
}
