import type { WorkspaceSchema, TableSchema, Row } from '../../core/schema';
import { IndexErr } from '../../core/errors';
import { defineIndex, type Index } from '../../core/indexes';
import type { Db } from '../../db/core';
import * as Y from 'yjs';
import { syncYTextToDiff, syncYArrayToDiff } from '../../utils/yjs';
import {
	deleteMarkdownFile,
	getMarkdownPath,
	parseMarkdownPath,
	parseMarkdownWithValidation,
	writeMarkdownFile,
} from './parser';
import { watch } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tryAsync, Ok } from 'wellcrafted/result';

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
 * Update a YJS row from markdown file data using granular diffs
 *
 * For primitive columns (text, integer, boolean, etc.), directly overwrites values.
 * For Y.Text columns, uses syncYTextToDiff() for granular character-level updates.
 * For Y.Array columns, uses syncYArrayToDiff() for granular element-level updates.
 *
 * @param db - Database instance
 * @param tableName - Name of the table
 * @param rowId - ID of the row to update
 * @param newData - New data from markdown file (validated)
 * @param schema - Table schema for type information
 */
function updateYJSRowFromMarkdown<TWorkspaceSchema extends WorkspaceSchema>(
	db: Db<TWorkspaceSchema>,
	tableName: string,
	rowId: string,
	newData: Row,
	schema: TableSchema,
): void {
	const table = db.tables[tableName];
	if (!table) {
		throw new Error(`Table "${tableName}" not found`);
	}

	// Get the existing row
	const rowResult = table.get(rowId);
	if (rowResult.status === 'not-found') {
		// Row doesn't exist, convert plain values to YJS types and insert
		const convertedRow: Record<string, any> = {};
		for (const [columnName, columnSchema] of Object.entries(schema)) {
			const value = newData[columnName];
			switch (columnSchema.type) {
				case 'ytext':
					if (typeof value === 'string') {
						const ytext = new Y.Text();
						ytext.insert(0, value);
						convertedRow[columnName] = ytext;
					} else {
						convertedRow[columnName] = value;
					}
					break;

				case 'multi-select':
					if (Array.isArray(value)) {
						convertedRow[columnName] = Y.Array.from(value);
					} else {
						convertedRow[columnName] = value;
					}
					break;

				default:
					convertedRow[columnName] = value;
					break;
			}
		}
		table.insert(convertedRow as any);
		return;
	}

	if (rowResult.status !== 'valid') {
		console.warn(
			`Cannot update invalid row ${tableName}/${rowId}: ${rowResult.status}`,
		);
		return;
	}

	const existingRow = rowResult.row;

	// Update each field based on its type
	db.transact(() => {
		for (const [columnName, columnSchema] of Object.entries(schema)) {
			const newValue = newData[columnName];
			const existingValue = existingRow[columnName];

			// Skip if values are identical (primitives)
			if (newValue === existingValue) {
				continue;
			}

			// Handle different column types
			switch (columnSchema.type) {
				case 'ytext': {
					// Use granular diff for Y.Text
					if (existingValue instanceof Y.Text && typeof newValue === 'string') {
						syncYTextToDiff(existingValue, newValue);
					} else if (newValue === null && columnSchema.nullable) {
						table.update({ id: rowId, [columnName]: null } as any);
					}
					break;
				}

				case 'multi-select': {
					// Use granular diff for Y.Array
					if (
						existingValue instanceof Y.Array &&
						Array.isArray(newValue)
					) {
						syncYArrayToDiff(existingValue, newValue);
					} else if (newValue === null && columnSchema.nullable) {
						table.update({ id: rowId, [columnName]: null } as any);
					}
					break;
				}

				default: {
					// For all other types (primitives), directly update
					table.update({ id: rowId, [columnName]: newValue } as any);
					break;
				}
			}
		}
	});
}

/**
 * Create a markdown index
 * Syncs YJS changes to markdown files for git-friendly persistence
 * No query interface - just persistence
 */
export function markdownIndex<TWorkspaceSchema extends WorkspaceSchema = WorkspaceSchema>({
	storagePath,
}: MarkdownIndexConfig): Index<TWorkspaceSchema, {}> {
	return defineIndex({
		init: async (db: Db<TWorkspaceSchema>) => {
			// Loop prevention: Track whether we're currently syncing
			// to avoid infinite loops between YJS observer and file watcher
			let isProcessingFileChange = false;
			let isProcessingYJSChange = false;

			// Set up observers for each table
			const unsubscribers: Array<() => void> = [];

			for (const tableName of db.getTableNames()) {
				const table = db.tables[tableName];
				if (!table) {
					throw new Error(`Table "${tableName}" not found`);
				}
				const unsub = table.observe({
					onAdd: async (row) => {
						// Loop prevention: Skip if we're processing a file change
						if (isProcessingFileChange) {
							return;
						}

						isProcessingYJSChange = true;
						try {
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
						} finally {
							isProcessingYJSChange = false;
						}
					},
					onUpdate: async (row) => {
						// Loop prevention: Skip if we're processing a file change
						if (isProcessingFileChange) {
							return;
						}

						isProcessingYJSChange = true;
						try {
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
						} finally {
							isProcessingYJSChange = false;
						}
					},
					onDelete: async (id) => {
						// Loop prevention: Skip if we're processing a file change
						if (isProcessingFileChange) {
							return;
						}

						isProcessingYJSChange = true;
						try {
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
						} finally {
							isProcessingYJSChange = false;
						}
					},
				});
				unsubscribers.push(unsub);
			}

			// Set up file watcher for bidirectional sync
			// Ensure the directory exists before watching
			await tryAsync({
				try: async () => {
					await mkdir(storagePath, { recursive: true });
				},
				catch: () => Ok(undefined),
			});

			const watcher = watch(
				storagePath,
				{ recursive: true },
				async (eventType, filename) => {
					// Loop prevention: Skip if we're processing a YJS change
					if (isProcessingYJSChange) {
						return;
					}

					if (!filename || !filename.endsWith('.md')) {
						return;
					}

					const filePath = `${storagePath}/${filename}`;

					// Parse the file path to get table name and row ID
					const parsed = parseMarkdownPath(storagePath, filePath);
					if (!parsed) {
						return;
					}

					const { tableName, id } = parsed;

					// Get the table schema
					const tableSchema = db.schema[tableName];
					if (!tableSchema) {
						console.warn(
							`File watcher: Unknown table "${tableName}" from file ${filename}`,
						);
						return;
					}

					isProcessingFileChange = true;
					try {
						// Handle file changes
						// Note: On some filesystems (like macOS), file writes generate 'rename' events
						// instead of 'change' events due to atomic rename operations
						if (eventType === 'rename') {
							// Check if file still exists
							const file = Bun.file(filePath);
							const exists = await file.exists();
							if (!exists) {
								// File was deleted, remove from YJS
								const table = db.tables[tableName];
								if (table?.has(id)) {
									table.delete(id);
								}
								return; // Exit early for deletions
							}
							// File exists, treat as a change and fall through
						}

						// Process file change (works for both 'change' and 'rename' with existing file)
						if (eventType === 'change' || eventType === 'rename') {
							// File was modified, parse and update YJS
							const parseResult = await parseMarkdownWithValidation(
								filePath,
								tableSchema,
							);

							switch (parseResult.status) {
								case 'failed-to-parse':
									console.error(
										IndexErr({
											message: `Failed to parse markdown file ${tableName}/${id}`,
											context: { tableName, id, filePath },
											cause: parseResult.error,
										}),
									);
									break;

								case 'failed-to-validate':
									console.error(
										IndexErr({
											message: `Failed to validate markdown file ${tableName}/${id}`,
											context: {
												tableName,
												id,
												filePath,
												validationResult: parseResult.validationResult,
											},
										}),
									);
									break;

								case 'success':
									// Update YJS document with granular diffs
									try {
										updateYJSRowFromMarkdown(
											db,
											tableName,
											id,
											parseResult.data,
											tableSchema,
										);
									} catch (error) {
										console.error(
											IndexErr({
												message: `Failed to update YJS from markdown file ${tableName}/${id}`,
												context: { tableName, id, filePath },
												cause: error,
											}),
										);
									}
									break;
							}
						}
					} finally {
						isProcessingFileChange = false;
					}
				},
			);

			return {
				destroy() {
					for (const unsub of unsubscribers) {
						unsub();
					}
					watcher.close();
				},
			};
		},
	});
}
