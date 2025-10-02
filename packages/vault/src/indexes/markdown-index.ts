import type { Index, IndexContext } from '../core/indexes';
import {
	writeMarkdownFile,
	deleteMarkdownFile,
	getMarkdownPath,
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
export function createMarkdownIndex(
	config: MarkdownIndexConfig,
): (context: IndexContext) => Index {
	return (context: IndexContext) => {
		return {
			// No init needed - files created on demand
			async init() {},

			async onAdd(tableName: string, id: string, data: Record<string, any>) {
				try {
					const filePath = getMarkdownPath(config.storagePath, tableName, id);
					await writeMarkdownFile(filePath, data);
				} catch (error) {
					console.error(
						`Markdown index onAdd failed for ${tableName}/${id}:`,
						error,
					);
				}
			},

			async onUpdate(tableName: string, id: string, data: Record<string, any>) {
				try {
					const filePath = getMarkdownPath(config.storagePath, tableName, id);
					await writeMarkdownFile(filePath, data);
				} catch (error) {
					console.error(
						`Markdown index onUpdate failed for ${tableName}/${id}:`,
						error,
					);
				}
			},

			async onDelete(tableName: string, id: string) {
				try {
					const filePath = getMarkdownPath(config.storagePath, tableName, id);
					await deleteMarkdownFile(filePath);
				} catch (error) {
					console.error(
						`Markdown index onDelete failed for ${tableName}/${id}:`,
						error,
					);
				}
			},

			async destroy() {
				// Cleanup if needed
			},
		};
	};
}
